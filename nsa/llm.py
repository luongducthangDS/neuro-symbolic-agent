"""LLM + embedding access. Gemini when GOOGLE_API_KEY is set, otherwise offline fallbacks."""
from __future__ import annotations

import hashlib
import math
import os
import re
import time
from pathlib import Path

from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


load_env()
MODELS = os.getenv("NSA_MODELS", "gemini-3.5-flash-lite,gemini-3.5-flash").split(",")


class Usage:
    calls = 0
    in_tokens = 0
    out_tokens = 0


class GeminiLLM:
    """Structured generation: the response is constrained to a Pydantic JSON schema."""

    def __init__(self, models: list[str] | None = None):
        from google import genai

        keys = [os.environ[k] for k in ("GOOGLE_API_KEY", "GOOGLE_API_KEY_2", "GOOGLE_API_KEY_3") if os.getenv(k)]
        self.clients = [genai.Client(api_key=k) for k in keys]
        self.models = models or MODELS
        self.k = 0

    def json(self, prompt: str, schema: type[BaseModel], system: str = "") -> BaseModel:
        from google.genai import types

        cfg = types.GenerateContentConfig(
            system_instruction=system or None, temperature=0,
            response_mime_type="application/json", response_schema=schema)
        last = None
        for model in self.models:  # model fallback only after every key and retry is spent
            for attempt in range(3 * len(self.clients)):
                try:
                    r = self.clients[self.k].models.generate_content(model=model, contents=prompt, config=cfg)
                    Usage.calls += 1
                    if r.usage_metadata:
                        Usage.in_tokens += r.usage_metadata.prompt_token_count or 0
                        Usage.out_tokens += r.usage_metadata.candidates_token_count or 0
                    return schema.model_validate_json(r.text)
                except Exception as e:  # 429 -> next key; full rotation -> wait retryDelay; else short backoff
                    last, msg = e, str(e)
                    if "404" in msg or "PerDay" in msg and len(self.clients) == 1:
                        break
                    if "429" in msg:
                        self.k = (self.k + 1) % len(self.clients)
                        if self.k == 0:
                            m = re.search(r"retry in ([\d.]+)s", msg)
                            time.sleep(min(float(m.group(1)) + 1, 65) if m else 20)
                    else:
                        time.sleep(2 * 2 ** min(attempt, 3))
        raise RuntimeError(f"all models failed: {last}")


def get_llm():
    return GeminiLLM() if os.getenv("GOOGLE_API_KEY") else None


# ---------------------------------------------------------------- embeddings

def _tokens(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def bow_embed(texts: list[str], dim: int = 1024) -> list[list[float]]:
    """Hashed bag of unigrams+bigrams. Offline fallback, also used by tests."""
    out = []
    for t in texts:
        v = [0.0] * dim
        toks = _tokens(t)
        for g in toks + [a + "_" + b for a, b in zip(toks, toks[1:])]:
            v[int(hashlib.md5(g.encode()).hexdigest(), 16) % dim] += 1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        out.append([x / n for x in v])
    return out


_EMBED_CLIENTS: list = []


def gemini_embed(texts: list[str], task: str) -> list[list[float]]:
    """Same 429 policy as generation: rotate keys, then wait the server's retryDelay."""
    from google import genai
    from google.genai import types

    if not _EMBED_CLIENTS:
        _EMBED_CLIENTS.extend(genai.Client(api_key=os.environ[k]) for k in
                              ("GOOGLE_API_KEY", "GOOGLE_API_KEY_2", "GOOGLE_API_KEY_3") if os.getenv(k))
    cfg = types.EmbedContentConfig(task_type=task)
    for attempt in range(4 * len(_EMBED_CLIENTS)):
        client = _EMBED_CLIENTS[attempt % len(_EMBED_CLIENTS)]
        try:
            r = client.models.embed_content(model="gemini-embedding-001", contents=texts, config=cfg)
            return [e.values for e in r.embeddings]
        except Exception as e:
            if "429" not in str(e) or attempt == 4 * len(_EMBED_CLIENTS) - 1:
                raise
            if (attempt + 1) % len(_EMBED_CLIENTS) == 0:
                m = re.search(r"retry in ([\d.]+)s", str(e))
                time.sleep(min(float(m.group(1)) + 1, 65) if m else 20)
    raise RuntimeError("unreachable")


def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    if os.getenv("GOOGLE_API_KEY") and os.getenv("NSA_EMBED", "gemini") == "gemini":
        return gemini_embed(texts, task)
    return bow_embed(texts)
