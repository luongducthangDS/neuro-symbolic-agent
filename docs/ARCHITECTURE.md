# Architecture

## Stack
Python 3.11 · LangGraph (state graph) · sqlglot (AST) · SQLite (read-only) · Gemini `gemini-3.5-flash-lite` (JSON schema output) + `gemini-embedding-001` · Pydantic · FastAPI · pytest · Docker · GitHub Actions.

## Thư mục
```
data/seed.py            sinh data/finco.db (seed 42, gitignored)
data/policies/*.md      3 văn bản quy định: QC (cho vay), PL (phân loại nợ), TS (tài sản bảo đảm)
nsa/llm.py              Gemini client: JSON có schema, xoay 3 key khi 429, fallback model; embedding (+ bag-of-words offline)
nsa/kg.py               parse "Điều N" → node, "theo Điều X của <văn bản>" → cạnh; retrieve = vector top-3 + BFS ≤3 hop, ≤10 node
nsa/sql_guard.py        Database: schema prompt, validate (AST, GROUP BY strict), EXPLAIN cost guard, run read-only + authorizer
nsa/verifier.py         Rule, ground_rule, compliance_operator, verify, number/literal grounding, masking guard
nsa/agent.py            LangGraph graph + prompts
nsa/api.py              FastAPI: POST /ask, GET /graph, GET /health
eval/gold.json          31 câu + gold SQL; eval/run_eval.py → eval/REPORT.md, eval/results.json
tests/test_nsa.py       test offline (scripted LLM)
```

## Luồng dữ liệu
```
retrieve → analyze ─┬─ intent=write  → refuse
                    ├─ answerable=no → no_data
                    ├─ needs_sql     → generate_sql ⇄ execute_sql (≤3 lần) → verify → answer
                    └─ chỉ văn bản   → verify → answer
```
- **analyze** (LLM): definitions, metrics, rules{metric, threshold, quote, scope}. Sau đó `ground_rule` (code) giữ/loại/sửa rule; có rule bị loại → hỏi lại LLM 1 lần kèm lý do.
- **execute_sql** (code): validate → EXPLAIN → chạy read-only → kiểm tra hằng số, COALESCE, rỗng, thiếu cột (metric kế hoạch ∪ metric của rule ∪ cột scope), NULL. Lỗi → feedback cho generate_sql.
- **verify** (code): so từng dòng với từng rule có scope, đếm theo rule.
- **answer**: kết luận tất định + đoạn LLM; số không có căn cứ → viết lại 1 lần → vẫn sai thì bỏ đoạn LLM.
