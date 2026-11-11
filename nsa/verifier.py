"""Symbolic layer: deterministic Python, no LLM.

1. ground_rule: a threshold the LLM extracted from a clause is kept only if its quote is a
   verbatim substring of that clause and the threshold number literally appears in the quote.
2. verify: compare every SQL metric value against every grounded rule on that metric.
3. ungrounded_numbers: every number in the final answer must trace back to a fact
   (SQL cell, threshold, clause text, question), allowing only display rounding/scaling.
"""
from __future__ import annotations

import operator
import re
from typing import Literal

from pydantic import BaseModel, Field, PrivateAttr

OPS = {"<=": operator.le, "<": operator.lt, ">=": operator.ge, ">": operator.gt, "==": operator.eq}
EPS = 1e-9


class Rule(BaseModel):
    metric: str = Field(description="snake_case metric name; percentages end with _pct")
    operator: Literal["<=", "<", ">=", ">", "=="]
    threshold: float
    unit: Literal["%", "VND", "days", "count", "months"]
    clause_id: str
    quote: str = Field(description="exact substring of the clause containing the threshold")
    scope_column: str | None = Field(None, description="SQL output column restricting where the rule applies, e.g. related_party or type")
    scope_value: str | None = Field(None, description="value of scope_column the rule applies to, e.g. '1' or 'o_to'")
    _operator_llm: str | None = PrivateAttr(None)
    _threshold_llm: float | None = PrivateAttr(None)  # set when the quote's number replaced the LLM's  # set when the text-derived operator overrode the LLM


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def parse_numbers(text: str) -> list[tuple[str, list[float], int]]:
    """Return (token, candidate values, decimals shown). Handles 1.234,5 and 1,234.5 styles."""
    out = []
    for tok in re.findall(r"(?<![\w.,])\d+(?:[.,]\d+)*", text):
        cands, decimals = set(), 0
        if re.fullmatch(r"\d+", tok):
            cands.add(float(tok))
        else:
            seps = re.findall(r"[.,]", tok)
            parts = re.split(r"[.,]", tok)
            # thousands grouping: every group after the first has 3 digits and one sep style
            if all(len(p) == 3 for p in parts[1:]) and len(set(seps)) == 1:
                cands.add(float("".join(parts)))
            # decimal: last separator is the decimal point
            last = max(tok.rfind("."), tok.rfind(","))
            intpart = re.sub(r"[.,]", "", tok[:last])
            frac = tok[last + 1:]
            cands.add(float(f"{intpart}.{frac}"))
            decimals = len(frac)
        out.append((tok, sorted(cands), decimals))
    return out


def ground_rule(rule: Rule, clauses: dict[str, str]) -> tuple[bool, str]:
    text = clauses.get(rule.clause_id)
    if text is None:
        return False, f"clause {rule.clause_id} was not retrieved"
    if _norm(rule.quote) not in _norm(text):
        return False, "quote is not a verbatim substring of the clause"
    if not any(abs(c - rule.threshold) < EPS for _, cs, _ in parse_numbers(rule.quote) for c in cs):
        # The quote is verbatim, so the text is the authority: take its number if it is unambiguous.
        pat = r"(\d+(?:[.,]\d+)?)\s*%" if rule.unit == "%" else r"(?<!Điều )(?<![\d.,])(\d+(?:[.,]\d+)?)"
        found = {float(x.replace(",", ".")) for x in re.findall(pat, rule.quote)}
        if len(found) != 1:
            return False, f"threshold {rule.threshold:g} does not appear in the quote"
        rule._threshold_llm, rule.threshold = rule.threshold, found.pop()
    if rule.unit == "%" and not rule.metric.endswith("_pct"):
        return False, "percentage rule must target a *_pct metric (unit mismatch guard)"
    op = compliance_operator(rule.quote)
    if op is None:
        return False, "cannot determine the comparison direction from the quote"
    if op != rule.operator:
        rule._operator_llm, rule.operator = rule.operator, op  # LLM direction overridden by the text
    return True, ""


# Compliance condition read from the clause wording, never from the LLM: the model was seen
# writing the violation condition (">" 3) instead of the compliance one ("<=" 3).
OP_PATTERNS = [
    (r"không (?:được )?(?:vượt quá|cao hơn|lớn hơn)|không quá|tối đa", "<="),
    (r"không (?:được )?(?:thấp hơn|nhỏ hơn|dưới)|tối thiểu|ít nhất", ">="),
    (r"\bdưới\b", "<"),
    (r"\btrên\b", ">"),
]


def compliance_operator(quote: str) -> str | None:
    q = _norm(quote)
    for pat, op in OP_PATTERNS:
        if re.search(pat, q):
            return op
    return None


def scope_match(cell, value) -> bool:
    """'Hải Phòng' matches 'Chi nhánh Hải Phòng'; codes and numbers must match exactly."""
    a, b = _norm(str(cell)), _norm(str(value))
    return a == b or (min(len(a), len(b)) >= 3 and not a.isdigit() and (a in b or b in a))


def verify(rules: list[Rule], columns: list[str], rows: list[list]) -> dict:
    """Deterministic compliance check of SQL rows against grounded rules."""
    facts, unverified = [], []
    for rule in rules:
        if rule.metric not in columns:
            unverified.append({"metric": rule.metric, "clause_id": rule.clause_id,
                               "reason": "metric not present in SQL result"})
            continue
        mi = columns.index(rule.metric)
        if rule.scope_column and rule.scope_column not in columns:
            unverified.append({"metric": rule.metric, "clause_id": rule.clause_id,
                               "reason": f"scope column {rule.scope_column} not present in SQL result"})
            continue
        for row in rows:
            if rule.scope_column and not scope_match(row[columns.index(rule.scope_column)], rule.scope_value):
                continue
            v = row[mi]
            if not isinstance(v, (int, float)):
                unverified.append({"metric": rule.metric, "clause_id": rule.clause_id,
                                   "reason": f"non-numeric value {v!r}"})
                continue
            label = ", ".join(f"{c}={row[i]}" for i, c in enumerate(columns)
                              if isinstance(row[i], str) or c == rule.scope_column)
            # ponytail: exact float compare with EPS; Decimal if money sums ever need cent precision
            ok = OPS[rule.operator](v, rule.threshold) or (rule.operator in ("<=", ">=") and abs(v - rule.threshold) < EPS)
            facts.append({"subject": label or "(toàn bộ)", "metric": rule.metric, "value": v,
                          "operator": rule.operator, "threshold": rule.threshold, "unit": rule.unit,
                          "clause_id": rule.clause_id, "status": "PASS" if ok else "FAIL"})
    if not facts:
        verdict = "UNVERIFIED" if rules else "NO_RULE"
    else:
        verdict = "FAIL" if any(f["status"] == "FAIL" for f in facts) else "PASS"
    by_rule: dict[tuple, dict] = {}
    for f, key in ((f, (f["clause_id"], f["metric"], f["operator"], f["threshold"])) for f in facts):
        b = by_rule.setdefault(key, {"clause_id": key[0], "metric": key[1], "requirement": f"{key[2]} {key[3]:g}",
                                     "checked": 0, "failed": 0})
        b["checked"] += 1
        b["failed"] += f["status"] == "FAIL"
    return {"verdict": verdict, "facts": facts, "unverified": unverified, "by_rule": list(by_rule.values())}


def allowed_numbers(*sources) -> set[float]:
    """Numbers an answer may mention: raw values plus common display scalings."""
    vals: set[float] = set()

    def add(v):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return
        v = float(v)
        for s in (1, 100, 0.01, 1e-3, 1e-6, 1e-9):  # ratio<->%, VND->nghìn/triệu/tỷ
            vals.add(v * s)

    def walk(x):
        if isinstance(x, (list, tuple, set)):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            for y in x.values():
                walk(y)
        elif isinstance(x, str):
            for _, cands, _ in parse_numbers(x):
                for c in cands:
                    add(c)
        else:
            add(x)

    for s in sources:
        walk(s)
    return vals


def ungrounded_numbers(answer: str, allowed: set[float]) -> list[str]:
    bad = []
    for tok, cands, dec in parse_numbers(answer):
        tol = 0.5 * 10 ** -dec + EPS
        if not any(abs(c - a) <= max(tol, abs(a) * 1e-9) for c in cands for a in allowed):
            bad.append(tok)
    return bad


TRIVIAL_LITERALS = {0, 1, 2, 100, 1000, 7, 12, 30, 365, 366, 1e6, 1e9}  # ponytail: calendar/scale constants


def ungrounded_sql_literals(tree, allowed: set[float]) -> list[str]:
    """Numeric literals in generated SQL must come from the policy text or the question.

    Blocks the LLM from inventing a threshold inside the query (e.g. `> 15` when the clause says 10%).
    LIMIT/OFFSET values and ROUND precision are exempt.
    """
    from sqlglot import exp

    bad = []
    for lit in tree.find_all(exp.Literal):
        if lit.is_string or lit.find_ancestor(exp.Limit, exp.Offset):
            continue
        parent = lit.parent
        if isinstance(parent, exp.Round) and lit is parent.args.get("decimals"):
            continue
        v = float(lit.this)
        if v in TRIVIAL_LITERALS or any(abs(v - a) < 1e-9 for a in allowed):
            continue
        bad.append(lit.this)
    return bad


def masked_metrics(tree, metrics: list[str]) -> list[str]:
    """Metric columns wrapped in COALESCE/IFNULL: turns 'no data' into a fabricated 0."""
    from sqlglot import exp

    return [a.alias for a in tree.find_all(exp.Alias)
            if a.alias in metrics and a.this.find(exp.Coalesce) is not None]
