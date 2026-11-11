# neuro-symbolic-agent: agent notes

## 2026-11-11: build end to end (git local, chưa có remote)

- Dự án 2 trong lộ trình: GraphRAG (vector + đồ thị dẫn chiếu điều khoản) + Text-to-SQL tự sửa lỗi + symbolic verifier, LangGraph, FastAPI. Kiến trúc và kết quả xem `README.md`, số đo ở `eval/REPORT.md`.
- Dữ liệu hư cấu: `data/seed.py` (seed 42, ngày báo cáo 2026-09-30) sinh `data/finco.db` (gitignored). Đổi seed → số gold tự tính lại vì eval chạy gold SQL lúc chấm.
- LLM: Gemini `gemini-3.5-flash-lite` (fallback `gemini-3.5-flash`), embedding `gemini-embedding-001`, cache ở `data/embeddings.json`. `.env` (gitignored) có `GOOGLE_API_KEY`, `_2`, `_3` copy từ `DocuMindAI/.env`; `nsa/llm.py` xoay vòng key khi 429.

## Gotchas

- Free tier: flash-lite chịu được 3 run eval nhờ xoay 3 key; `gemini-3.5-flash` chỉ 20 request/ngày, nên fallback sang nó dễ hết quota.
- Windows console cp1252: chạy script in tiếng Việt cần `PYTHONUTF8=1`.
- Test offline phải chạy với `GOOGLE_API_KEY=` rỗng hoặc không có `.env`; test không gọi mạng.
- Bash heredoc lồng `'''` dễ vỡ: viết script patch ra file rồi chạy.

## Bài học đã đưa vào code (đừng gỡ)

- LLM hay ghi chiều so sánh là điều kiện vi phạm (`> 3`) thay vì tuân thủ: chiều so sánh luôn đọc từ câu chữ (`compliance_operator`).
- Prompt "LIMIT 50" làm verifier đếm thiếu → bỏ, trần 5.000 dòng, chỉ cắt phần đưa cho LLM.
- SQLite cho phép cột trần trong GROUP BY → kết quả sai im lặng; có guard `_bare_columns`.
- LLM che "không có dữ liệu" bằng `COALESCE(...,0)` → guard `masked_metrics`.
- Cột bắt buộc của SQL = metric kế hoạch ∪ metric của rule ∪ cột scope, để đếm vi phạm do verifier làm.
