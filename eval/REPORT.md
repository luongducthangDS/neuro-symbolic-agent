# Evaluation report

Runs: 3. Questions per run: 31. LLM: gemini-3.5-flash-lite, gemini-3.5-flash.

## End-to-end pass rate

| Category | Pass |
|---|---|
| adversarial | 12/12 (100%) |
| compliance | 35/39 (90%) |
| doc | 15/15 (100%) |
| numeric | 21/21 (100%) |
| unanswerable | 6/6 (100%) |
| **all** | **89/93 (96%)** |

## Text-to-SQL self-correction

- Questions that reached SQL: 69
- Valid on first attempt: 58/69 (84%)
- Valid after self-correction (max 3 attempts): 63/69 (91%)
- Mean attempts: 1.25
- Rejections by stage: {'validate': 3, 'literal_guard': 1, 'cost_guard': 5, 'empty': 5, 'null': 9}

## Symbolic layer

- Rules extracted by LLM: 63; kept after verbatim-quote check: 51; rejected: 12
- Comparison direction overridden by clause wording: 26/51 (51%) of kept rules
- Answer narratives: {'grounded': 78, 'skipped_no_data': 6, 'refused': 6, 'no_data': 3}

## Symbolic verifier vs LLM judging the same SQL rows

| | Verdict correct | Violator set exact |
|---|---|---|
| Symbolic verifier | 29/30 (97%) | 11/12 (92%) |
| LLM-only judgement | 27/30 (90%) | 4/12 (33%) |

## Retrieval (no LLM, Gemini embeddings)

| Method | Mean clause recall | Multi-hop recall | Full recall rate |
|---|---|---|---|
| vector@3 | 0.785 | 0.656 | 0.625 |
| vector@10 | 0.927 | 0.883 | 0.792 |
| graph(3 seeds, <=10) | 1.0 | 1.0 | 1.0 |

24 questions with gold clauses (15 need 2+ clauses); graph returns 5.71 clauses on average.

## Cost and latency

- Latency p50 6.9 s, p95 15.0 s
- LLM calls per question: 3.20
- Tokens per question: 3690 in, 579 out

## Failures

- run 0 `c09` Có bao nhiêu khoản vay đang hoạt động có LTV vượt mức tối đa theo loại tài sản bảo đảm? — checks {'value': False}, verdict UNVERIFIED, attempt stages ['validate', 'validate', 'literal_guard']
- run 0 `c12` Chi nhánh TP.HCM có tuân thủ giới hạn tỷ lệ nợ xấu không? — checks {'verdict': False, 'value': True}, verdict UNVERIFIED, attempt stages ['execute']
- run 1 `c05` Khách hàng là người có liên quan nào vượt giới hạn dư nợ cho phép? — checks {'verdict': True, 'fail_recall': True, 'fail_precision': False, 'value': False}, verdict FAIL, attempt stages ['execute']
- run 1 `c08` Có bao nhiêu khoản vay tiêu dùng đang hoạt động có lãi suất vượt trần? — checks {'value': False}, verdict FAIL, attempt stages ['execute']
