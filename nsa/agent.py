"""Neuro-symbolic agent as a LangGraph state graph.

retrieve -> analyze -> [generate_sql <-> execute_sql]* -> verify -> answer
  neural:   analyze (rules/metrics from clauses), generate_sql, answer narrative
  symbolic: rule grounding, SQL guard, literal grounding, verify, number grounding
"""
from __future__ import annotations

import time
from typing import Literal, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from .kg import Index
from .sql_guard import Database
from .verifier import (Rule, allowed_numbers, ground_rule, masked_metrics, ungrounded_numbers,
                       ungrounded_sql_literals, verify)

REPORT_DATE = "2026-09-30"
MAX_SQL_ATTEMPTS = 3


# ------------------------------------------------------------------ schemas
class Definition(BaseModel):
    term: str
    sql_hint: str = Field(description="how the definition translates to columns/conditions")
    clause_id: str


class Metric(BaseModel):
    name: str = Field(description="snake_case SQL output column; percentages end with _pct and are 0-100")
    description: str


class Analysis(BaseModel):
    intent: Literal["read", "write"] = Field(description="write = user asks to modify/delete data")
    needs_sql: bool
    answerable: bool = Field(description="false if the database cannot contain the requested data (other period, unknown entity)")
    unanswerable_reason: str
    definitions: list[Definition]
    metrics: list[Metric]
    rules: list[Rule]


class SQLDraft(BaseModel):
    reasoning: str
    sql: str


class Narrative(BaseModel):
    answer: str


class State(TypedDict, total=False):
    question: str
    retrieved: list[dict]
    clauses: dict[str, str]
    analysis: dict
    rules: list[dict]
    rejected_rules: list[dict]
    attempts: list[dict]
    sql_result: dict
    verification: dict
    answer: str
    narrative_status: str
    trace: list[dict]


# ------------------------------------------------------------------ prompts
SYS = ("You are a credit-risk analyst agent for Công ty Tài chính An Phát. "
       f"Report date is {REPORT_DATE}. Never invent numbers or thresholds.")

ANALYZE = """Question: {question}

Retrieved policy clauses (with ids):
{clauses}

Tasks:
1. intent: "write" if the user asks to insert/update/delete/modify data, else "read".
2. needs_sql: true if answering needs numbers from the loan database.
   answerable: false if the requested data cannot exist in the database (see DATA COVERAGE), with the reason.
3. definitions: terms from the clauses the SQL must respect (e.g. how "nợ xấu" maps to days_past_due), with clause_id.
4. metrics: the SQL output columns needed. Use *_pct (0-100 scale) for percentages.
5. rules: every numeric threshold from the clauses that the question asks to check. quote MUST be copied
   verbatim from the clause and contain the threshold. If a rule applies only to a subset (e.g. related
   parties, a collateral type), set scope_column (a column the SQL will output) and scope_value.
   Leave rules empty if the question does not ask for a compliance check.

DATA COVERAGE: one snapshot of the loan book at the report date {report_date}. outstanding and days_past_due
are as of that date; there is no history of earlier periods. Repayment history exists in table repayments.

Database schema (for naming metrics/scope columns):
{schema}"""

GEN_SQL = """Write ONE SQLite SELECT query answering: {question}

Schema:
{schema}

Report date: {report_date}. Only active loans (status='active') have outstanding balance.
Definitions from policy:
{definitions}
The result MUST contain these columns (exact aliases): {metrics}
plus any scope/label columns: {scope_cols}.
Rules:
- Return the metric for EVERY relevant subject (one row per subject); do NOT filter or count by the policy
  threshold yourself, a separate verifier compares and counts.
- Percentages on a 0-100 scale, no ROUND on metric columns.
- Policy numbers used in conditions must come from the clauses above; do not invent constants.
- Do not add LIMIT unless the question asks for a top-N; the verifier must see every subject.
- Never wrap metric columns in COALESCE/IFNULL: missing data must stay visible.
{feedback}"""

ANSWER = """Question: {question}

Policy clauses:
{clauses}

SQL result (columns {columns}): {rows}

Deterministic verification (authoritative, do not contradict, counts are exact):
per-rule counts: {by_rule}
failing subjects (first 30): {facts}
Verdict: {verdict}

Write a concise Vietnamese answer (<=120 words). Cite clauses as [QC-8]. Use only numbers that appear
above (you may round or express VND in tỷ/triệu). If the data is missing, say so; do not guess.
{feedback}"""


def _fmt_clauses(ids: list[str], clauses: dict[str, str]) -> str:
    return "\n".join(f"[{i}] {clauses[i]}" for i in ids)


def deterministic_summary(v: dict) -> str:
    if v["verdict"] == "NO_RULE" and not v["unverified"]:
        return ""
    verdict = {"PASS": "TUÂN THỦ", "FAIL": "VI PHẠM", "UNVERIFIED": "CHƯA KIỂM CHỨNG ĐƯỢC",
               "NO_RULE": "KHÔNG CÓ NGƯỠNG CẦN KIỂM TRA"}[v["verdict"]]
    lines = [f"Kết luận (kiểm chứng tất định): {verdict}"]
    fails = [f for f in v["facts"] if f["status"] == "FAIL"]
    if v["facts"]:
        lines[0] += f" — {len(fails)}/{len(v['facts'])} phép so sánh vượt ngưỡng."
    for f in (fails or v["facts"])[:10]:
        u = f["unit"] if f["unit"] == "%" else " " + f["unit"]
        lines.append(f"- {f['subject']}: {f['metric']} = {f['value']:.6g}{u} (yêu cầu {f['operator']} "
                     f"{f['threshold']:g}{u}) [{f['clause_id']}] → {f['status']}")
    for u in v["unverified"][:5]:
        lines.append(f"- Không kiểm được {u['metric']} [{u['clause_id']}]: {u['reason']}")
    return "\n".join(lines)


# ------------------------------------------------------------------ agent
class Agent:
    def __init__(self, llm, index: Index | None = None, db: Database | None = None, max_sql_attempts=MAX_SQL_ATTEMPTS):
        self.llm, self.index, self.db = llm, index or Index(), db or Database()
        self.max_sql_attempts = max_sql_attempts
        self.all_clauses = {cid: c.render() for cid, c in self.index.clauses.items()}
        self.graph = self._build()

    def _log(self, s: State, node: str, t0: float, **kw):
        s.setdefault("trace", []).append({"node": node, "ms": round((time.perf_counter() - t0) * 1000), **kw})

    # nodes ----------------------------------------------------------------
    def retrieve(self, s: State) -> State:
        t0 = time.perf_counter()
        hits = self.index.retrieve(s["question"])
        s["retrieved"] = hits
        s["clauses"] = {h["id"]: self.all_clauses[h["id"]] for h in hits}
        self._log(s, "retrieve", t0, ids=[h["id"] for h in hits])
        return s

    def analyze(self, s: State) -> State:
        t0 = time.perf_counter()
        prompt = ANALYZE.format(question=s["question"], clauses=_fmt_clauses(list(s["clauses"]), s["clauses"]),
                                schema=self.db.schema_prompt(), report_date=REPORT_DATE)
        a, kept, rejected = self._extract(prompt, s["clauses"])
        if rejected:  # self-correction for rule extraction: tell the model why its rules were rejected
            fb = "\n".join(f"- {r['metric']} {r['threshold']} quote={r['quote']!r}: {r['reason']}" for r in rejected)
            a2, kept2, rejected2 = self._extract(prompt + "\n\nYour previous rules were rejected by a deterministic "
                                                 "checker:\n" + fb + "\nQuotes must be copied verbatim from the clauses; "
                                                 "thresholds come from the clauses, not from the question.", s["clauses"])
            if len(kept2) >= len(kept):
                a, kept, rejected = a2, kept2, rejected + rejected2
        s["analysis"], s["rules"], s["rejected_rules"] = a.model_dump(), kept, rejected
        s["attempts"] = []
        self._log(s, "analyze", t0, intent=a.intent, needs_sql=a.needs_sql, rules=len(kept),
                  rejected=len(rejected), operator_overrides=sum("operator_llm" in r for r in kept),
                  threshold_repairs=sum("threshold_llm" in r for r in kept), answerable=a.answerable)
        return s

    def _extract(self, prompt: str, clauses: dict[str, str]):
        a: Analysis = self.llm.json(prompt, Analysis, SYS)
        kept, rejected = [], []
        for r in a.rules:
            ok, why = ground_rule(r, clauses)
            d = r.model_dump() | ({} if ok else {"reason": why})
            if r._operator_llm:
                d["operator_llm"] = r._operator_llm
            if r._threshold_llm is not None:
                d["threshold_llm"] = r._threshold_llm
            (kept if ok else rejected).append(d)
        return a, kept, rejected

    @staticmethod
    def required_columns(s: State) -> list[str]:
        cols = [m["name"] for m in s["analysis"]["metrics"]]
        for r in s.get("rules", []):
            for c in (r["metric"], r.get("scope_column")):
                if c and c not in cols:
                    cols.append(c)
        return cols

    def generate_sql(self, s: State) -> State:
        t0 = time.perf_counter()
        a = s["analysis"]
        feedback = ""
        if s["attempts"]:
            feedback = "Previous attempts failed; fix the query:\n" + "\n".join(
                f"Attempt {i + 1}: {x['sql']}\nError: {x['error']}" for i, x in enumerate(s["attempts"]))
        draft: SQLDraft = self.llm.json(GEN_SQL.format(
            question=s["question"], schema=self.db.schema_prompt(), report_date=REPORT_DATE,
            definitions="\n".join(f"- {d['term']}: {d['sql_hint']} [{d['clause_id']}]" for d in a["definitions"]) or "-",
            metrics=self.required_columns(s),
            scope_cols=sorted({r["scope_column"] for r in s["rules"] if r.get("scope_column")}) or "-",
            feedback=feedback), SQLDraft, SYS)
        s["attempts"].append({"sql": draft.sql.strip().rstrip(";"), "error": None})
        self._log(s, "generate_sql", t0, attempt=len(s["attempts"]))
        return s

    def execute_sql(self, s: State) -> State:
        t0 = time.perf_counter()
        att = s["attempts"][-1]
        res = self.db.run(att["sql"])
        if res["ok"]:
            _, _, tree = self.db.validate(att["sql"])
            allowed = allowed_numbers(s["question"], list(s["clauses"].values()), REPORT_DATE)
            lits = ungrounded_sql_literals(tree, allowed)
            need = self.required_columns(s)
            missing = [m for m in need if m not in res["columns"]]
            masked = masked_metrics(tree, need)
            if masked:
                res = {"ok": False, "stage": "masking_guard",
                       "error": f"Metric columns {masked} are wrapped in COALESCE/IFNULL. If no rows match, "
                                "the data does not exist; do not substitute a default value."}
            elif lits:
                res = {"ok": False, "stage": "literal_guard",
                       "error": f"Numeric literals {lits} do not appear in the policy clauses or question. "
                                "Use only thresholds from the clauses."}
            elif not res["rows"]:
                res = {"ok": False, "stage": "empty",
                       "error": "Query returned no rows. Check filters, date formats (YYYY-MM-DD) and enum values."}
            elif missing:
                res = {"ok": False, "stage": "columns",
                       "error": f"Missing required output columns {missing}; got {res['columns']}."}
            elif any(r[res["columns"].index(m)] is None for m in need for r in res["rows"]
                     if m in {x["metric"] for x in s.get("rules", [])} or m in {x["name"] for x in s["analysis"]["metrics"]}):
                res = {"ok": False, "stage": "null", "error": f"Metric columns {need} contain NULL values."}
        att["error"] = None if res["ok"] else res["error"]
        att["stage"] = res["stage"]
        s["sql_result"] = res
        self._log(s, "execute_sql", t0, ok=res["ok"], stage=res["stage"])
        return s

    def verify(self, s: State) -> State:
        t0 = time.perf_counter()
        res = s.get("sql_result") or {}
        rules = [Rule(**{k: v for k, v in r.items() if k not in ("reason", "operator_llm", "threshold_llm")}) for r in s.get("rules", [])]
        if res.get("ok"):
            v = verify(rules, res["columns"], res["rows"])
        else:
            v = verify(rules, [], []) if s["analysis"]["needs_sql"] else {
                "verdict": "NO_RULE", "facts": [], "unverified": []}
            if s["analysis"]["needs_sql"] and not rules:
                v["verdict"] = "UNVERIFIED"
        if res.get("truncated"):
            v["unverified"].append({"metric": "*", "clause_id": "-", "reason": "SQL result truncated; counts are incomplete"})
        s["verification"] = v
        self._log(s, "verify", t0, verdict=v["verdict"], facts=len(v["facts"]))
        return s

    def answer(self, s: State) -> State:
        t0 = time.perf_counter()
        v, res = s["verification"], s.get("sql_result") or {}
        summary = deterministic_summary(v)
        if s["analysis"]["needs_sql"] and not res.get("ok"):
            s["answer"] = summary + "\nKhông truy vấn được dữ liệu sau " \
                f"{len(s['attempts'])} lần thử (lỗi cuối: {res.get('error')}). Hệ thống không suy đoán số liệu."
            s["narrative_status"] = "skipped_no_data"
            self._log(s, "answer", t0, status=s["narrative_status"])
            return s
        rows = res.get("rows", [])[:30]
        allowed = allowed_numbers(s["question"], list(s["clauses"].values()), rows, v, len(res.get("rows", [])),
                                  sum(f["status"] == "FAIL" for f in v["facts"]), REPORT_DATE)
        feedback, status = "", "fallback_template"
        for attempt in range(2):
            n: Narrative = self.llm.json(ANSWER.format(
                question=s["question"], clauses=_fmt_clauses(list(s["clauses"]), s["clauses"]),
                columns=res.get("columns", []), rows=rows, by_rule=v.get("by_rule", []),
                facts=[f for f in v["facts"] if f["status"] == "FAIL"][:30], verdict=v["verdict"],
                feedback=feedback), Narrative, SYS)
            bad = ungrounded_numbers(n.answer, allowed)
            if not bad:
                status = "grounded" if attempt == 0 else "grounded_after_retry"
                s["answer"] = (summary + "\n\n" + n.answer.strip()).strip()
                break
            feedback = f"Your previous answer contained numbers not supported by the data: {bad}. Remove or fix them."
        else:
            s["answer"] = summary or "Không đưa ra được câu trả lời có căn cứ số liệu."  # ponytail: drop the narrative rather than ship an unverifiable number
        s["narrative_status"] = status
        self._log(s, "answer", t0, status=status)
        return s

    def no_data(self, s: State) -> State:
        s["verification"] = {"verdict": "UNVERIFIED", "facts": [], "unverified": []}
        s["answer"] = (f"Không có dữ liệu để trả lời: {s['analysis']['unanswerable_reason']} "
                       "Hệ thống không suy đoán số liệu.")
        s["narrative_status"] = "no_data"
        s.setdefault("trace", []).append({"node": "no_data", "ms": 0})
        return s

    def refuse(self, s: State) -> State:
        s["verification"] = {"verdict": "NO_RULE", "facts": [], "unverified": []}
        s["answer"] = "Từ chối: hệ thống chỉ có quyền đọc (read-only), không thực hiện thao tác ghi/xoá/sửa dữ liệu."
        s["narrative_status"] = "refused"
        s.setdefault("trace", []).append({"node": "refuse", "ms": 0})
        return s

    # graph ----------------------------------------------------------------
    def _build(self):
        g = StateGraph(State)
        for name in ("retrieve", "analyze", "generate_sql", "execute_sql", "verify", "answer", "refuse", "no_data"):
            g.add_node(name, getattr(self, name))
        g.set_entry_point("retrieve")
        g.add_edge("retrieve", "analyze")
        g.add_conditional_edges("analyze", self._route)
        g.add_conditional_edges("execute_sql", lambda s: "verify" if s["sql_result"]["ok"]
                                or len(s["attempts"]) >= self.max_sql_attempts else "generate_sql")
        g.add_edge("generate_sql", "execute_sql")
        g.add_edge("verify", "answer")
        g.add_edge("answer", END)
        g.add_edge("refuse", END)
        g.add_edge("no_data", END)
        return g.compile()

    @staticmethod
    def _route(s: State) -> str:
        a = s["analysis"]
        if a["intent"] == "write":
            return "refuse"
        if not a["answerable"]:
            return "no_data"
        return "generate_sql" if a["needs_sql"] else "verify"

    def ask(self, question: str) -> State:
        return self.graph.invoke({"question": question, "trace": []}, {"recursion_limit": 25})
