"""Clause-level knowledge graph over the policy documents + hybrid retrieval.

Nodes are articles ("Điều N") of each document. Edges are explicit cross-references
parsed from the text ("theo Điều 3 của Quy định phân loại nợ"). Retrieval = vector
top-k seeds, then breadth-first expansion along reference edges (multi-hop).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from .llm import ROOT, embed

POLICY_DIR = ROOT / "data" / "policies"
CACHE = ROOT / "data" / "embeddings.json"
DOC_NAMES = {"Quy chế cho vay": "QC", "Quy định phân loại nợ": "PL", "Chính sách tài sản bảo đảm": "TS"}
REF = re.compile(r"Điều (\d+)(?: của (" + "|".join(DOC_NAMES) + "))?")
HEAD = re.compile(r"^## Điều (\d+)\. (.+)$", re.M)


@dataclass
class Clause:
    id: str            # e.g. "QC-8"
    doc: str           # e.g. "Quy chế cho vay"
    title: str
    text: str
    refs: list[str] = field(default_factory=list)

    def render(self) -> str:
        return f"[{self.id}] {self.doc}, Điều {self.id.split('-')[1]}. {self.title}: {self.text}"


def load_clauses(policy_dir: Path = POLICY_DIR) -> dict[str, Clause]:
    clauses: dict[str, Clause] = {}
    for path in sorted(policy_dir.glob("*.md")):
        code = path.stem.split("_")[0]
        doc = next(name for name, c in DOC_NAMES.items() if c == code)
        body = path.read_text(encoding="utf-8")
        heads = list(HEAD.finditer(body))
        for i, h in enumerate(heads):
            end = heads[i + 1].start() if i + 1 < len(heads) else len(body)
            text = " ".join(body[h.end():end].split())
            cid = f"{code}-{h.group(1)}"
            refs = []
            for m in REF.finditer(text):
                target = f"{DOC_NAMES[m.group(2)] if m.group(2) else code}-{m.group(1)}"
                if target != cid and target not in refs:
                    refs.append(target)
            clauses[cid] = Clause(cid, doc, h.group(2), text, refs)
    for c in clauses.values():  # drop dangling refs
        c.refs = [r for r in c.refs if r in clauses]
    return clauses


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b)) / ((math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))) or 1)


class Index:
    def __init__(self, clauses: dict[str, Clause] | None = None, embed_fn=None):
        self.clauses = clauses or load_clauses()
        self.embed_fn = embed_fn or embed
        self.ids = list(self.clauses)
        self.vecs = self._doc_vectors()

    def _doc_vectors(self) -> list[list[float]]:
        texts = [self.clauses[i].render() for i in self.ids]
        if self.embed_fn is not embed:  # injected (tests): no cache
            return self.embed_fn(texts)
        backend = "gemini" if os.getenv("GOOGLE_API_KEY") and os.getenv("NSA_EMBED", "gemini") == "gemini" else "bow"
        key = hashlib.sha1((backend + "\n".join(texts)).encode()).hexdigest()
        if CACHE.exists():
            cached = json.loads(CACHE.read_text())
            if cached.get("key") == key:
                return cached["vecs"]
        vecs = embed(texts)
        CACHE.write_text(json.dumps({"key": key, "vecs": vecs}))
        return vecs

    def _query_vec(self, q: str) -> list[float]:
        if self.embed_fn is embed:
            return embed([q], task="RETRIEVAL_QUERY")[0]
        return self.embed_fn([q])[0]

    def vector_search(self, q: str, k: int) -> list[tuple[str, float]]:
        qv = self._query_vec(q)
        scored = sorted(((i, _cos(qv, v)) for i, v in zip(self.ids, self.vecs)), key=lambda x: -x[1])
        return scored[:k]

    def retrieve(self, q: str, k: int = 3, hops: int = 3, max_nodes: int = 10) -> list[dict]:
        """Vector seeds + BFS along reference edges. Returns [{id, via, score}] in order."""
        hits = [{"id": i, "via": "vector", "score": round(s, 4)} for i, s in self.vector_search(q, k)]
        seen = {h["id"] for h in hits}
        frontier = [h["id"] for h in hits]
        for hop in range(1, hops + 1):
            nxt = []
            for cid in frontier:
                for r in self.clauses[cid].refs:
                    if r not in seen and len(hits) < max_nodes:
                        seen.add(r)
                        hits.append({"id": r, "via": f"ref<-{cid} (hop {hop})", "score": None})
                        nxt.append(r)
            frontier = nxt
        return hits

    def edges(self) -> list[tuple[str, str]]:
        return [(c.id, r) for c in self.clauses.values() for r in c.refs]
