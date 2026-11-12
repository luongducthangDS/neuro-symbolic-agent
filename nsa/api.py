"""FastAPI service. Run: uvicorn nsa.api:app --port 8000"""
from __future__ import annotations

import json
import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .agent import Agent
from .llm import get_llm

app = FastAPI(title="Neuro-Symbolic Agent", version="1.0")

# Allow the Cloudflare Pages frontend (and local dev) to call the API.
# CORS_ORIGINS env var is a comma-separated list; defaults to allow all origins.
_origins_env = os.getenv("CORS_ORIGINS", "*")
_origins = [o.strip() for o in _origins_env.split(",")] if _origins_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Ask(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@lru_cache(maxsize=1)
def agent() -> Agent:
    llm = get_llm()
    if llm is None:
        raise HTTPException(503, "GOOGLE_API_KEY is not set")
    return Agent(llm)


def _sse(event: str, data: object) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_ask(question: str):
    """Generator: yields SSE frames as the agent progresses through nodes."""
    a = agent()

    # Node → human-readable label for the UI progress bar
    NODE_LABEL = {
        "retrieve":     "Truy xuất điều khoản…",
        "analyze":      "Phân tích câu hỏi…",
        "generate_sql": "Tạo SQL…",
        "execute_sql":  "Chạy SQL…",
        "verify":       "Kiểm chứng…",
        "answer":       "Tạo câu trả lời…",
        "refuse":       "Từ chối (read-only)",
        "no_data":      "Không có dữ liệu",
    }

    final_state: dict = {}

    try:
        # LangGraph stream() with stream_mode="updates" yields
        # {node_name: state_update} dicts
        for update_dict in a.graph.stream(
            {"question": question, "trace": []},
            stream_mode="updates",
            config={"recursion_limit": 25},
        ):
            # each dict has exactly one key: the node that just ran
            for node_name, update in update_dict.items():
                label = NODE_LABEL.get(node_name, node_name)
                attempt_info = None

                # Attach SQL attempt count for progress detail
                if node_name == "execute_sql" and isinstance(update, dict):
                    attempts = update.get("attempts") or []
                    n = len(attempts)
                    last_err = attempts[-1].get("error") if attempts else None
                    if last_err:
                        label = f"SQL lần {n} thất bại, thử lại…"
                        attempt_info = {"attempt": n, "error": last_err[:80]}
                    else:
                        label = f"SQL lần {n} thành công"

                yield _sse("progress", {"node": node_name, "label": label,
                                        **({"detail": attempt_info} if attempt_info else {})})

                # Merge update into final_state
                if isinstance(update, dict):
                    final_state.update(update)

    except Exception as exc:
        yield _sse("error", {"message": str(exc)})
        return

    # Build final response (same shape as /ask)
    keep = ("answer", "verification", "rules", "rejected_rules", "attempts",
            "retrieved", "narrative_status", "trace")
    out = {k: final_state.get(k) for k in keep}
    if out.get("verification"):
        out["verification"] = {**out["verification"],
                               "facts": out["verification"]["facts"][:200]}

    yield _sse("result", out)
    yield _sse("done", {})


@app.get("/health")
def health():
    a = agent()
    return {
        "status": "ok",
        "clauses": len(a.index.clauses),
        "edges": len(a.index.edges()),
        "tables": a.db.counts,
        "pct_columns": sorted(a.db.pct_columns),
    }


@app.post("/ask")
async def ask(body: Ask):
    a = agent()
    s = await run_in_threadpool(a.ask, body.question)  # graph + sqlite are sync
    keep = ("answer", "verification", "rules", "rejected_rules", "attempts", "retrieved", "narrative_status", "trace")
    out = {k: s.get(k) for k in keep}
    if out["verification"]:
        out["verification"] = {**out["verification"], "facts": out["verification"]["facts"][:200]}
    return out


@app.post("/ask/stream")
async def ask_stream(body: Ask):
    """SSE endpoint: streams node-level progress events then the final result.

    The LangGraph graph is synchronous, so we run it in a threadpool and pipe
    each SSE frame through an asyncio.Queue to the async StreamingResponse.
    """
    import asyncio

    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def _run():
        try:
            for frame in _stream_ask(body.question):
                loop.call_soon_threadsafe(queue.put_nowait, frame)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

    async def gen():
        asyncio.get_event_loop().run_in_executor(None, _run)
        while True:
            frame = await queue.get()
            if frame is None:
                break
            yield frame

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering on Render
        },
    )


@app.get("/graph")
def graph():
    a = agent()
    return {"nodes": [{"id": c.id, "doc": c.doc, "title": c.title} for c in a.index.clauses.values()],
            "edges": [{"from": x, "to": y, "kind": "ref" if y in a.index.clauses[x].refs else "term"}
                      for x, y in a.index.edges(terms=True)]}
