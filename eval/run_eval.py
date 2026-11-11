"""End-to-end evaluation. Usage: python -m eval.run_eval [--runs N] [--only c01,c02]

Writes eval/results.json and eval/REPORT.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
import time
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from nsa.agent import REPORT_DATE, SYS, Agent
from nsa.kg import Index
from nsa.llm import Usage, get_llm
from nsa.sql_guard import DB_PATH, LARGE_TABLES

HERE = Path(__file__).parent
NO_DATA = ("không có dữ liệu", "không truy vấn được", "không có số liệu", "chưa có dữ liệu", "không tồn tại",
           "không tìm thấy", "không đủ dữ liệu", "không suy đoán")


class LLMVerdict(BaseModel):
    verdict: Literal["PASS", "FAIL"]
    violating_subjects: list[str]


def gold_values(sql: str) -> list[float]:
    con = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    vals = [float(v) for row in con.execute(sql) for v in row if isinstance(v, (int, float))]
    con.close()
    return vals


def close(a: float, b: float) -> bool:
    return abs(a - b) <= max(5e-3, abs(b) * 1e-4)


def retrieval_ablation(index: Index, gold: list[dict]) -> dict:
    out = {"vector@3": [], "vector@10": [], "graph(3 seeds, <=10)": [], "graph_nodes": []}
    multihop = {"vector@3": [], "vector@10": [], "graph(3 seeds, <=10)": []}
    for g in gold:
        need = set(g["clauses"])
        if not need:
            continue
        v3 = {i for i, _ in index.vector_search(g["q"], 3)}
        v10 = {i for i, _ in index.vector_search(g["q"], 10)}
        gr = [h["id"] for h in index.retrieve(g["q"])]
        for name, got in (("vector@3", v3), ("vector@10", v10), ("graph(3 seeds, <=10)", set(gr))):
            r = len(need & got) / len(need)
            out[name].append(r)
            if len(need) >= 2:
                multihop[name].append(r)
        out["graph_nodes"].append(len(gr))
    return {"recall_all": {k: round(statistics.mean(v), 3) for k, v in out.items() if k != "graph_nodes"},
            "recall_multihop(>=2 clauses)": {k: round(statistics.mean(v), 3) for k, v in multihop.items()},
            "full_recall_rate": {k: round(sum(x == 1 for x in v) / len(v), 3) for k, v in out.items() if k != "graph_nodes"},
            "n_questions": len(out["vector@3"]), "n_multihop": len(multihop["vector@3"]),
            "mean_graph_nodes": round(statistics.mean(out["graph_nodes"]), 2)}


def llm_only_verdict(llm, s: dict) -> dict:
    res = s["sql_result"]
    prompt = (f"Question: {s['question']}\nPolicy clauses:\n" + "\n".join(s["clauses"].values()) +
              f"\nSQL result columns {res['columns']}: {res['rows'][:50]}\nReport date {REPORT_DATE}.\n"
              "Decide whether the policy is complied with (PASS) or violated (FAIL), and list violating subjects.")
    v: LLMVerdict = llm.json(prompt, LLMVerdict, SYS)
    return v.model_dump()


def score(g: dict, s: dict) -> dict:
    v = s.get("verification", {})
    ans = s.get("answer", "")
    checks = {}
    if g.get("verdict") == "REFUSE":
        checks["refused"] = s.get("narrative_status") == "refused"
    elif g.get("verdict"):
        checks["verdict"] = v.get("verdict") == g["verdict"]
    if g.get("fail"):
        fails = [f["subject"] for f in v.get("facts", []) if f["status"] == "FAIL"]
        checks["fail_recall"] = all(any(x in f for f in fails) for x in g["fail"])
        checks["fail_precision"] = bool(fails) and all(any(x in f for x in g["fail"]) for f in fails)
    if g.get("gold_sql"):
        gv = gold_values(g["gold_sql"])
        res = s.get("sql_result") or {}
        cells = [c for row in res.get("rows", []) for c in row if isinstance(c, (int, float))] if res.get("ok") else []
        n_fail = sum(f["status"] == "FAIL" for f in v.get("facts", []))
        checks["value"] = all(any(close(c, x) for c in cells) or (len(gv) == 1 and n_fail == x and not res.get("truncated"))
                              for x in gv)
    if g.get("text"):
        checks["text"] = all(t in ans for t in g["text"])
    if g.get("no_data"):
        checks["no_data"] = s.get("narrative_status") in ("skipped_no_data", "no_data") or any(p in ans.lower() for p in NO_DATA)
    if g.get("guard_only"):
        checks["guard_held"] = True  # re-checked below from executed SQL
    return checks


def run(only: set[str] | None, runs: int) -> None:
    gold = json.loads((HERE / "gold.json").read_text(encoding="utf-8"))
    if only:
        gold = [g for g in gold if g["id"] in only]
    llm = get_llm()
    agent = Agent(llm)
    ret = retrieval_ablation(agent.index, gold)
    print(json.dumps(ret, indent=1))
    results = []
    for r in range(runs):
        for g in gold:
            c0, i0, o0 = Usage.calls, Usage.in_tokens, Usage.out_tokens
            t0 = time.perf_counter()
            try:
                s = agent.ask(g["q"])
                err = None
            except Exception as e:  # keep going; a crash counts as a failure
                s, err = {}, repr(e)
            dt = time.perf_counter() - t0
            checks = score(g, s) if not err else {"crashed": False}
            if g.get("guard_only"):
                con = agent.db._connect()
                for a in s.get("attempts", []):
                    if a.get("stage") == "execute":
                        plan = " ".join(row[3] for row in con.execute("EXPLAIN QUERY PLAN " + a["sql"]))
                        if any(re.search(rf"SCAN {t}\b", plan) for t in LARGE_TABLES):
                            checks["guard_held"] = False
                con.close()
            baseline = None
            if g.get("verdict") in ("PASS", "FAIL") and (s.get("sql_result") or {}).get("ok"):
                try:
                    lv = llm_only_verdict(llm, s)
                    baseline = {"verdict_ok": lv["verdict"] == g["verdict"], **lv}
                    if g.get("fail"):
                        subj = lv["violating_subjects"]
                        baseline["fail_exact"] = bool(subj) and all(any(x in t for t in subj) for x in g["fail"]) \
                            and all(any(x in t for x in g["fail"]) for t in subj)
                except Exception as e:
                    baseline = {"error": repr(e)}
            item = {"run": r, "id": g["id"], "cat": g["cat"], "q": g["q"], "pass": bool(checks) and all(checks.values()),
                    "checks": checks, "error": err, "seconds": round(dt, 2),
                    "llm_calls": Usage.calls - c0, "tokens_in": Usage.in_tokens - i0, "tokens_out": Usage.out_tokens - o0,
                    "attempts": s.get("attempts", []), "verdict": s.get("verification", {}).get("verdict"),
                    "rules": s.get("rules", []), "rejected_rules": s.get("rejected_rules", []),
                    "narrative_status": s.get("narrative_status"), "retrieved": [h["id"] for h in s.get("retrieved", [])],
                    "answer": s.get("answer"), "llm_only_baseline": baseline, "trace": s.get("trace", [])}
            results.append(item)
            print(f"[{r}] {g['id']} pass={item['pass']} {checks} {dt:.1f}s attempts={len(item['attempts'])}", flush=True)
    (HERE / "results.json").write_text(json.dumps({"retrieval": ret, "results": results}, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    report(ret, results, runs)


def report(ret: dict, results: list[dict], runs: int) -> None:
    def pct(x, n):
        return f"{x}/{n} ({100 * x / n:.0f}%)" if n else "-"

    cats = sorted({r["cat"] for r in results})
    lines = ["# Evaluation report", "", f"Runs: {runs}. Questions per run: {len(results) // runs}. "
             "LLM: " + ", ".join(__import__("nsa.llm", fromlist=["MODELS"]).MODELS) + ".", "",
             "## End-to-end pass rate", "", "| Category | Pass |", "|---|---|"]
    for c in cats:
        rs = [r for r in results if r["cat"] == c]
        lines.append(f"| {c} | {pct(sum(r['pass'] for r in rs), len(rs))} |")
    lines.append(f"| **all** | **{pct(sum(r['pass'] for r in results), len(results))}** |")

    sql_items = [r for r in results if r["attempts"]]
    first = sum(1 for r in sql_items if r["attempts"][0].get("stage") == "execute" and r["attempts"][0].get("error") is None)
    final = sum(1 for r in sql_items if r["attempts"][-1].get("error") is None)
    stages: dict[str, int] = {}
    for r in sql_items:
        for a in r["attempts"]:
            if a.get("error"):
                stages[a["stage"]] = stages.get(a["stage"], 0) + 1
    lines += ["", "## Text-to-SQL self-correction", "",
              f"- Questions that reached SQL: {len(sql_items)}",
              f"- Valid on first attempt: {pct(first, len(sql_items))}",
              f"- Valid after self-correction (max 3 attempts): {pct(final, len(sql_items))}",
              f"- Mean attempts: {statistics.mean(len(r['attempts']) for r in sql_items):.2f}" if sql_items else "",
              f"- Rejections by stage: {stages}"]

    kept = sum(len(r["rules"]) for r in results)
    rej = sum(len(r["rejected_rules"]) for r in results)
    over = sum(1 for r in results for x in r["rules"] if "operator_llm" in x)
    ns: dict[str, int] = {}
    for r in results:
        ns[str(r["narrative_status"])] = ns.get(str(r["narrative_status"]), 0) + 1
    lines += ["", "## Symbolic layer", "",
              f"- Rules extracted by LLM: {kept + rej}; kept after verbatim-quote check: {kept}; rejected: {rej}",
              f"- Comparison direction overridden by clause wording: {pct(over, kept)} of kept rules",
              f"- Answer narratives: {ns}"]

    base = [r for r in results if r["llm_only_baseline"] and "verdict_ok" in r["llm_only_baseline"]]
    if base:
        sym_v = sum(r["checks"].get("verdict", False) for r in base)
        llm_v = sum(r["llm_only_baseline"]["verdict_ok"] for r in base)
        fb = [r for r in base if "fail_exact" in r["llm_only_baseline"]]
        sym_f = sum(r["checks"].get("fail_recall", False) and r["checks"].get("fail_precision", False) for r in fb)
        llm_f = sum(r["llm_only_baseline"]["fail_exact"] for r in fb)
        lines += ["", "## Symbolic verifier vs LLM judging the same SQL rows", "",
                  "| | Verdict correct | Violator set exact |", "|---|---|---|",
                  f"| Symbolic verifier | {pct(sym_v, len(base))} | {pct(sym_f, len(fb))} |",
                  f"| LLM-only judgement | {pct(llm_v, len(base))} | {pct(llm_f, len(fb))} |"]

    lines += ["", "## Retrieval (no LLM, Gemini embeddings)", "", "| Method | Mean clause recall | Multi-hop recall | Full recall rate |",
              "|---|---|---|---|"]
    for k in ret["recall_all"]:
        lines.append(f"| {k} | {ret['recall_all'][k]} | {ret['recall_multihop(>=2 clauses)'][k]} | {ret['full_recall_rate'][k]} |")
    lines.append(f"\n{ret['n_questions']} questions with gold clauses ({ret['n_multihop']} need 2+ clauses); "
                 f"graph returns {ret['mean_graph_nodes']} clauses on average.")

    secs = sorted(r["seconds"] for r in results)
    lines += ["", "## Cost and latency", "",
              f"- Latency p50 {statistics.median(secs):.1f} s, p95 {secs[int(0.95 * (len(secs) - 1))]:.1f} s",
              f"- LLM calls per question: {statistics.mean(r['llm_calls'] for r in results):.2f}",
              f"- Tokens per question: {statistics.mean(r['tokens_in'] for r in results):.0f} in, "
              f"{statistics.mean(r['tokens_out'] for r in results):.0f} out",
              "", "## Failures", ""]
    for r in results:
        if not r["pass"]:
            lines.append(f"- run {r['run']} `{r['id']}` {r['q']} — checks {r['checks']}, verdict {r['verdict']}, "
                         f"attempt stages {[a.get('stage') for a in r['attempts']]}{', error ' + r['error'] if r['error'] else ''}")
    (HERE / "REPORT.md").write_text("\n".join(x for x in lines if x is not None) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    run(set(a.only.split(",")) if a.only else None, a.runs)
