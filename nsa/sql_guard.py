"""SQL safety: AST validation, full-scan guard, read-only sandboxed execution.

Defense in depth, each layer independent of the others:
1. sqlglot AST: one statement, SELECT only, whitelisted tables, columns resolve, no risky functions.
2. EXPLAIN QUERY PLAN: reject a full SCAN of a large table (must filter on an index).
3. Engine: read-only URI + PRAGMA query_only + sqlite authorizer that denies anything but reads.
4. Budget: progress-handler timeout and a row cap.
"""
from __future__ import annotations

import re
import sqlite3
import time
from pathlib import Path

import sqlglot
from sqlglot import exp
from sqlglot.errors import OptimizeError
from sqlglot.optimizer.qualify import qualify

from .llm import ROOT

DB_PATH = ROOT / "data" / "finco.db"
LARGE_TABLES = {"repayments"}
MAX_ROWS = 5000  # verifier needs every subject; only a slice is shown to the LLM
TIMEOUT_S = 3.0
BANNED_FUNCS = {"load_extension", "readfile", "writefile", "edit", "fts3_tokenizer", "zeroblob", "randomblob"}
WRITE_NODES = tuple(getattr(exp, n) for n in (
    "Insert", "Update", "Delete", "Drop", "Create", "Alter", "Command", "Merge", "Pragma",
    "Attach", "Detach", "TruncateTable", "Transaction", "Commit", "Rollback") if hasattr(exp, n))


class Database:
    def __init__(self, path: Path = DB_PATH):
        self.path = Path(path)
        con = self._connect(authorize=False)
        self.tables: dict[str, dict[str, str]] = {}
        for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            self.tables[t] = {r[1]: r[2] for r in con.execute(f"PRAGMA table_info({t})")}
        self.counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in self.tables}
        self.indexed = {t: sorted({r[2] for idx in con.execute(f"PRAGMA index_list({t})")
                                   for r in con.execute(f"PRAGMA index_info({idx[1]})")}) for t in self.tables}
        self.ddl = [r[0] for r in con.execute("SELECT sql FROM sqlite_master WHERE type='table'")]
        # columns whose DDL comment declares a percent scale, e.g. "interest_rate REAL, -- percent per year"
        self.pct_columns = frozenset(line.split()[0] for t in self.ddl for line in t.splitlines()
                                     if "-- percent" in line and line.split())
        self.enums = {}
        for t, cols in self.tables.items():
            for c, typ in cols.items():
                if typ == "TEXT" and not c.endswith(("date", "name")):
                    vals = [r[0] for r in con.execute(f"SELECT DISTINCT {c} FROM {t} LIMIT 12")]
                    if len(vals) <= 10:
                        self.enums[f"{t}.{c}"] = vals
        con.close()

    def _connect(self, authorize: bool = True) -> sqlite3.Connection:
        con = sqlite3.connect(f"file:{self.path.as_posix()}?mode=ro", uri=True, check_same_thread=False)
        con.execute("PRAGMA query_only = ON")
        if authorize:
            con.set_authorizer(_authorizer)
        return con

    def column_values(self, column: str) -> list | None:
        """Distinct values of a real column (None if no table has it). Used to validate rule scopes."""
        for t, cols in self.tables.items():
            if column in cols:
                con = self._connect(authorize=False)
                try:  # ponytail: 2,000 distinct values is plenty for scope checks on this schema
                    return [r[0] for r in con.execute(f"SELECT DISTINCT {column} FROM {t} LIMIT 2000")]
                finally:
                    con.close()
        return None

    def schema_prompt(self) -> str:
        lines = [*self.ddl, "-- row counts: " + ", ".join(f"{t}={n}" for t, n in self.counts.items())]
        lines += [f"-- {k} values: {v}" for k, v in self.enums.items()]
        lines += [f"-- LARGE table {t}: must filter on an indexed column {self.indexed[t]}" for t in LARGE_TABLES]
        return "\n".join(lines)

    # ------------------------------------------------------------ validation
    def validate(self, sql: str) -> tuple[bool, str, exp.Expression | None]:
        try:
            stmts = [s for s in sqlglot.parse(sql, read="sqlite") if s is not None]
        except sqlglot.errors.ParseError as e:
            return False, f"Syntax error: {str(e).splitlines()[0]}", None
        if len(stmts) != 1:
            return False, f"Exactly one statement allowed, got {len(stmts)}.", None
        tree = stmts[0]
        if not isinstance(tree, exp.Query):
            return False, f"Only SELECT queries are allowed (got {tree.key.upper()}).", None
        bad = next(tree.find_all(*WRITE_NODES), None) if WRITE_NODES else None
        if bad is not None:
            return False, f"Forbidden operation inside query: {bad.key.upper()}.", None
        for f in tree.find_all(exp.Anonymous, exp.Func):
            name = (f.name if isinstance(f, exp.Anonymous) else f.sql_name()).lower()
            if name in BANNED_FUNCS:
                return False, f"Function {name}() is not allowed.", None
        bare = _bare_columns(tree)
        if bare:
            return False, (f"Column(s) {bare} are neither aggregated nor in GROUP BY; SQLite would return an "
                           "arbitrary row. Aggregate them, add them to GROUP BY, or drop the aggregate."), None
        ctes = {c.alias_or_name for c in tree.find_all(exp.CTE)}
        for t in tree.find_all(exp.Table):
            if t.name and t.name not in ctes and t.name not in self.tables:
                return False, f"Unknown table '{t.name}'. Available: {sorted(self.tables)}.", None
        try:
            qualify(tree.copy(), schema=self.tables, dialect="sqlite", validate_qualify_columns=True)
        except OptimizeError as e:
            msg = str(e)
            if "could not be resolved" in msg or "Unknown" in msg:
                return False, f"Column error: {msg}", None
            # ponytail: other qualify limitations are left to SQLite to judge
        return True, "", tree

    def _full_scans(self, con: sqlite3.Connection, sql: str, tree: exp.Expression) -> list[str]:
        alias = {t.alias_or_name: t.name for t in tree.find_all(exp.Table)}
        found = []
        for row in con.execute("EXPLAIN QUERY PLAN " + sql):
            m = re.match(r"SCAN (\w+)", row[3])
            if m and alias.get(m.group(1), m.group(1)) in LARGE_TABLES:
                found.append(alias.get(m.group(1), m.group(1)))
        return found

    # ------------------------------------------------------------- execution
    def run(self, sql: str) -> dict:
        ok, err, tree = self.validate(sql)
        if not ok:
            return {"ok": False, "stage": "validate", "error": err}
        con = self._connect()
        deadline = time.monotonic() + TIMEOUT_S
        con.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
        try:
            scans = self._full_scans(con, sql, tree)
            if scans:
                t = scans[0]
                return {"ok": False, "stage": "cost_guard",
                        "error": f"Full table scan on large table '{t}' ({self.counts[t]} rows). "
                                 f"Add a WHERE filter on an indexed column {self.indexed[t]} or join through one."}
            cur = con.execute(sql)
            cols = [d[0] for d in cur.description]
            rows = cur.fetchmany(MAX_ROWS + 1)
            return {"ok": True, "stage": "execute", "columns": cols, "rows": [list(r) for r in rows[:MAX_ROWS]],
                    "truncated": len(rows) > MAX_ROWS}
        except sqlite3.Error as e:
            stage = "timeout" if "interrupted" in str(e) else "execute"
            return {"ok": False, "stage": stage, "error": f"SQLite error: {e}"}
        finally:
            con.close()


def _bare_columns(tree: exp.Expression) -> list[str]:
    """ONLY_FULL_GROUP_BY check (what Postgres enforces and SQLite silently skips)."""
    bad = []
    for sel in tree.find_all(exp.Select):
        group = sel.args.get("group")
        gexprs = {g.sql() for g in group.expressions} if group else set()
        gnames = {g.name for g in group.expressions if isinstance(g, exp.Column)} if group else set()
        if not group and not any(p.find(exp.AggFunc) for p in sel.expressions):
            continue
        for p in sel.expressions:
            inner = p.this if isinstance(p, exp.Alias) else p
            if inner.sql() in gexprs or (isinstance(p, exp.Alias) and p.alias in gexprs):
                continue
            for c in inner.find_all(exp.Column):
                if (c.find_ancestor(exp.Select) is sel and not c.find_ancestor(exp.AggFunc, exp.Window)
                        and c.sql() not in gexprs and c.name not in gnames):
                    bad.append(c.sql())
    return bad


_ALLOWED = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
            getattr(sqlite3, "SQLITE_RECURSIVE", 33)}


def _authorizer(action, arg1, arg2, dbname, source):
    if action == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in BANNED_FUNCS:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK if action in _ALLOWED else sqlite3.SQLITE_DENY
