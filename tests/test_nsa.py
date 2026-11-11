"""Offline tests: no API key needed (bag-of-words embeddings + scripted LLM)."""
import pytest

from nsa.agent import Agent, Analysis, Narrative, SQLDraft
from nsa.kg import Index, load_clauses
from nsa.llm import bow_embed
from nsa.sql_guard import Database
from nsa.verifier import (Rule, allowed_numbers, compliance_operator, ground_rule, parse_numbers,
                          ungrounded_numbers, ungrounded_sql_literals, verify)


@pytest.fixture(scope="module")
def db():
    return Database()


@pytest.fixture(scope="module")
def index():
    return Index(embed_fn=bow_embed)


NPL_SQL = ("SELECT b.name, 100.0*SUM(CASE WHEN l.days_past_due>90 THEN l.outstanding ELSE 0 END)/SUM(l.outstanding) "
           "AS npl_pct FROM loans l JOIN branches b ON b.branch_id=l.branch_id WHERE l.status='active' GROUP BY b.name")


# ------------------------------------------------------------ SQL guard
@pytest.mark.parametrize("sql,stage", [
    ("DELETE FROM loans", "validate"),
    ("SELECT 1; DROP TABLE loans", "validate"),
    ("PRAGMA query_only=OFF", "validate"),
    ("ATTACH DATABASE 'x.db' AS x", "validate"),
    ("SELECT * FROM sqlite_master", "validate"),
    ("SELECT nonexistent FROM loans", "validate"),
    ("SELECT load_extension('x')", "validate"),
    ("SELECT * FROM repayments", "cost_guard"),
    ("SELECT COUNT(*) FROM repayments r", "cost_guard"),
    ("SELECT product, COUNT(*) AS n, outstanding FROM loans GROUP BY product", "validate"),
])
def test_guard_blocks(db, sql, stage):
    r = db.run(sql)
    assert not r["ok"] and r["stage"] == stage, r


def test_guard_allows_indexed_and_cte(db):
    assert db.run(NPL_SQL)["ok"]
    assert db.run("SELECT SUM(amount_paid) AS s FROM repayments WHERE paid_date BETWEEN '2026-09-01' AND '2026-09-30'")["ok"]
    assert db.run("WITH c AS (SELECT equity FROM capital ORDER BY as_of_date DESC LIMIT 1) SELECT equity FROM c")["ok"]


def test_engine_layer_denies_writes_even_without_validator(db):
    con = db._connect()
    for q in ("DELETE FROM loans", "CREATE TABLE z(a)", "PRAGMA query_only=OFF"):
        with pytest.raises(Exception):
            con.execute(q)


# ------------------------------------------------------------ knowledge graph
def test_reference_edges_cross_documents():
    c = load_clauses()
    assert c["QC-8"].refs == ["PL-3"] and c["PL-3"].refs == ["PL-2"] and "TS-4" in c["QC-9"].refs


def test_multihop_reaches_definition(index):
    hits = index.retrieve("Chi nhánh vi phạm phải tạm dừng giải ngân không?")
    ids = [h["id"] for h in hits]
    assert ids[0] == "QC-10" or "QC-10" in ids
    assert {"QC-8", "PL-3", "PL-2"} <= set(ids)  # QC-10 -> QC-8 -> PL-3 -> PL-2


# ------------------------------------------------------------ verifier
def test_parse_numbers_vn_and_en():
    vals = {t: c for t, c, _ in parse_numbers("4,32% và 2.050 tỷ, 70.475.531.574 đồng, 3.5")}
    assert 4.32 in vals["4,32"] and 2050 in vals["2.050"] and 70475531574 in vals["70.475.531.574"] and 3.5 in vals["3.5"]


def test_compliance_operator_from_text():
    assert compliance_operator("không được vượt quá 3%") == "<="
    assert compliance_operator("tối thiểu 8%") == ">="


def test_ground_rule_rejects_invented_threshold_and_fixes_operator():
    clauses = {"QC-8": load_clauses()["QC-8"].render()}
    good = Rule(metric="npl_pct", operator=">", threshold=3, unit="%", clause_id="QC-8",
                quote="Tỷ lệ nợ xấu của mỗi chi nhánh không được vượt quá 3%.")
    assert ground_rule(good, clauses) == (True, "") and good.operator == "<="
    ts4 = {"TS-4": load_clauses()["TS-4"].render()}
    ambiguous = Rule(metric="ltv_pct", operator="<=", threshold=65, unit="%", clause_id="TS-4",
                     quote="bất động sản không vượt quá 70%; tài sản bảo đảm là ô tô không vượt quá 60%")
    assert not ground_rule(ambiguous, ts4)[0]  # two candidate numbers: cannot repair, reject
    paraphrase = good.model_copy(update={"quote": "nợ xấu tối đa 3%"})
    assert not ground_rule(paraphrase, clauses)[0]
    not_pct = good.model_copy(update={"metric": "npl_ratio"})
    assert not ground_rule(not_pct, clauses)[0]


def test_verify_scope_and_boundary():
    rules = [Rule(metric="exp_pct", operator="<=", threshold=10, unit="%", clause_id="QC-4", quote="x"),
             Rule(metric="exp_pct", operator="<=", threshold=5, unit="%", clause_id="QC-5", quote="x",
                  scope_column="related_party", scope_value="1")]
    cols = ["name", "related_party", "exp_pct"]
    v = verify(rules, cols, [["A", 0, 10.0], ["B", 1, 5.76], ["C", 0, 7.0]])
    status = {(f["clause_id"], f["subject"]): f["status"] for f in v["facts"]}
    assert status[("QC-4", "name=A")] == "PASS"  # exactly at the limit passes
    assert status[("QC-5", "name=B, related_party=1")] == "FAIL"
    assert ("QC-5", "name=A, related_party=0") not in status and v["verdict"] == "FAIL"


def test_number_grounding():
    allowed = allowed_numbers([[228_000_000_000, 11.1219]], "Điều 4 ... 10%")
    assert ungrounded_numbers("Dư nợ 228 tỷ đồng, tỷ lệ 11,12%, vượt 10% [QC-4]", allowed) == []
    assert ungrounded_numbers("Dư nợ 230 tỷ đồng", allowed) == ["230"]


def test_sql_literal_grounding(db):
    allowed = allowed_numbers("không được vượt quá 3%. nhóm 3 quá hạn từ 91 ngày đến 180 ngày, 10 ngày đến 90 ngày")
    _, _, tree = db.validate(NPL_SQL)
    assert ungrounded_sql_literals(tree, allowed) == []
    _, _, bad = db.validate(NPL_SQL.replace(">90", ">60"))
    assert ungrounded_sql_literals(bad, allowed) == ["60"]


# ------------------------------------------------------------ agent end-to-end (scripted LLM)
class ScriptedLLM:
    def __init__(self, script):
        self.script = list(script)

    def json(self, prompt, schema, system=""):
        item = self.script.pop(0)
        assert isinstance(item, schema), f"expected {schema.__name__}, got {type(item).__name__}"
        self.last_prompt = prompt
        return item


ANALYSIS = Analysis(intent="read", needs_sql=True, answerable=True, unanswerable_reason="", definitions=[], metrics=[{"name": "npl_pct", "description": "x"}],
                    rules=[Rule(metric="npl_pct", operator=">", threshold=3, unit="%", clause_id="QC-8",
                                quote="không được vượt quá 3%")])


def test_agent_self_corrects_and_verifies(index, db):
    llm = ScriptedLLM([
        ANALYSIS,
        SQLDraft(reasoning="", sql="SELECT b.name, SUM(npl) AS npl_pct FROM loans l JOIN branches b USING(branch_id) GROUP BY b.name"),
        SQLDraft(reasoning="", sql=NPL_SQL),
        Narrative(answer="Cần Thơ có tỷ lệ nợ xấu 4,32%, vượt ngưỡng 3% [QC-8]."),
    ])
    s = Agent(llm, index, db).ask("Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu theo Điều 8?")
    assert [a["stage"] for a in s["attempts"]] == ["validate", "execute"]
    assert "Column error" in llm_feedback(s)
    v = s["verification"]
    assert v["verdict"] == "FAIL"
    assert [f["subject"] for f in v["facts"] if f["status"] == "FAIL"] == ["name=Cần Thơ"]
    assert s["narrative_status"] == "grounded" and "VI PHẠM" in s["answer"]


def llm_feedback(s):
    return s["attempts"][0]["error"]


def test_agent_drops_hallucinated_number(index, db):
    llm = ScriptedLLM([ANALYSIS, SQLDraft(reasoning="", sql=NPL_SQL),
                       Narrative(answer="Cần Thơ 5,9%."), Narrative(answer="Cần Thơ 6,1%.")])
    s = Agent(llm, index, db).ask("Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu theo Điều 8?")
    assert s["narrative_status"] == "fallback_template"
    assert "5,9" not in s["answer"] and "6,1" not in s["answer"] and "Cần Thơ" in s["answer"]


def test_agent_gives_up_without_guessing(index, db):
    bad = SQLDraft(reasoning="", sql="DELETE FROM loans")
    s = Agent(ScriptedLLM([ANALYSIS, bad, bad, bad]), index, db).ask("Tỷ lệ nợ xấu theo Điều 8?")
    assert len(s["attempts"]) == 3 and s["verification"]["verdict"] == "UNVERIFIED"
    assert "không suy đoán" in s["answer"]


def test_agent_refuses_write(index, db):
    s = Agent(ScriptedLLM([ANALYSIS.model_copy(update={"intent": "write"})]), index, db).ask("Xoá khoản vay")
    assert s["narrative_status"] == "refused" and "attempts" not in s or not s.get("attempts")


def test_threshold_repaired_from_verbatim_quote():
    clauses = {"QC-8": load_clauses()["QC-8"].render()}
    injected = Rule(metric="npl_pct", operator="<=", threshold=5, unit="%", clause_id="QC-8",
                    quote="Tỷ lệ nợ xấu của mỗi chi nhánh không được vượt quá 3%.")
    assert ground_rule(injected, clauses)[0] and injected.threshold == 3 and injected._threshold_llm == 5


def test_masking_guard(db):
    from nsa.verifier import masked_metrics
    _, _, tree = db.validate("SELECT COALESCE(SUM(outstanding), 0) AS v FROM loans WHERE branch_id = 99")
    assert masked_metrics(tree, ["v"]) == ["v"]
    _, _, tree = db.validate("SELECT IFNULL(SUM(outstanding), 0) AS v FROM loans")
    assert masked_metrics(tree, ["v"]) == ["v"]
    _, _, ok = db.validate("SELECT SUM(outstanding) AS v FROM loans")
    assert masked_metrics(ok, ["v"]) == []


def test_api_ask_and_graph(index, db, monkeypatch):
    from fastapi.testclient import TestClient

    import nsa.api as api
    a = Agent(ScriptedLLM([ANALYSIS, SQLDraft(reasoning="", sql=NPL_SQL),
                           Narrative(answer="Cần Thơ vượt ngưỡng 3% [QC-8].")]), index, db)
    monkeypatch.setattr(api, "agent", lambda: a)
    client = TestClient(api.app)
    r = client.post("/ask", json={"question": "Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu?"})
    assert r.status_code == 200 and r.json()["verification"]["verdict"] == "FAIL"
    assert client.post("/ask", json={"question": ""}).status_code == 422
    g = client.get("/graph").json()
    assert {"from": "QC-8", "to": "PL-3"} in g["edges"]


def test_scope_match():
    from nsa.verifier import scope_match
    assert scope_match("Hải Phòng", "Chi nhánh Hải Phòng") and scope_match(1, "1")
    assert not scope_match(1, "10") and not scope_match("o_to", "bat_dong_san")
