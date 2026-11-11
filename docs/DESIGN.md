# Design (không có UI: định dạng đầu ra)

## Câu trả lời (`answer`)
1. Dòng kết luận tất định, luôn đứng đầu:
   `Kết luận (kiểm chứng tất định): VI PHẠM | TUÂN THỦ | CHƯA KIỂM CHỨNG ĐƯỢC — k/n phép so sánh vượt ngưỡng.`
   Câu hỏi chỉ về văn bản (không có rule) thì bỏ dòng này.
2. Tối đa 10 dòng fact: `- <nhãn>: <metric> = <giá trị>% (yêu cầu <= <ngưỡng>%) [QC-8] → FAIL`. Ưu tiên dòng FAIL.
3. Đoạn giải thích tiếng Việt của LLM, ≤120 từ, trích điều khoản dạng `[QC-8]`, chỉ dùng số đã có căn cứ.
4. Từ chối / không có dữ liệu: một câu, nói rõ hệ thống không suy đoán số liệu.

## API `POST /ask` → JSON
`answer`, `verification{verdict, facts[≤200], unverified, by_rule}`, `rules`, `rejected_rules` (kèm `reason`), `attempts[{sql, stage, error}]`, `retrieved[{id, via, score}]`, `narrative_status` (`grounded | grounded_after_retry | fallback_template | refused | no_data | skipped_no_data`), `trace[{node, ms, …}]`.

## Báo cáo eval (`eval/REPORT.md`)
Markdown, các mục cố định: pass rate theo nhóm, self-correction SQL, tầng symbolic, verifier so với LLM tự phán, retrieval, chi phí/latency, danh sách lượt sai.

## Mã điều khoản
`<mã văn bản>-<số điều>`: `QC` Quy chế cho vay, `PL` Quy định phân loại nợ, `TS` Chính sách tài sản bảo đảm.
