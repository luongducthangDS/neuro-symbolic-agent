"""FastAPI service. Run: uvicorn nsa.api:app --port 8000"""
from __future__ import annotations

from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .agent import Agent
from .llm import get_llm

app = FastAPI(title="Neuro-Symbolic Agent", version="1.0")


class Ask(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@lru_cache(maxsize=1)
def agent() -> Agent:
    llm = get_llm()
    if llm is None:
        raise HTTPException(503, "GOOGLE_API_KEY is not set")
    return Agent(llm)


@app.get("/health")
def health():
    a = agent()
    return {"status": "ok", "clauses": len(a.index.clauses), "edges": len(a.index.edges()), "tables": a.db.counts}


@app.post("/ask")
async def ask(body: Ask):
    a = agent()
    s = await run_in_threadpool(a.ask, body.question)  # graph + sqlite are sync
    keep = ("answer", "verification", "rules", "rejected_rules", "attempts", "retrieved", "narrative_status", "trace")
    out = {k: s.get(k) for k in keep}
    if out["verification"]:
        out["verification"] = {**out["verification"], "facts": out["verification"]["facts"][:200]}
    return out


@app.get("/graph")
def graph():
    a = agent()
    return {"nodes": [{"id": c.id, "doc": c.doc, "title": c.title} for c in a.index.clauses.values()],
            "edges": [{"from": x, "to": y} for x, y in a.index.edges()]}
