# Tasks

## Đã xong (2026-11-11)
- [x] Seed CSDL + 3 văn bản quy định có dẫn chiếu chéo
- [x] Đồ thị điều khoản + truy xuất vector + BFS
- [x] SQL guard (AST, GROUP BY strict, EXPLAIN, read-only, authorizer, budget)
- [x] Verifier (ground rule, chiều so sánh, scope, number/literal grounding, masking guard)
- [x] Agent LangGraph + vòng tự sửa SQL + hỏi lại khi rule bị loại
- [x] Eval 31 câu × 3 lần, FastAPI, Dockerfile, CI, repo public

## Tiếp theo (làm lần lượt từ trên xuống)
- [x] Build và chạy thử Docker image (`docker build -t nsa .`, gọi `/health`) — 404 MB, `/health` + `/ask` đúng trong container
- [ ] Guard "một dòng = một đối tượng": so số dòng với `COUNT(DISTINCT khoá)` của đối tượng (lỗi c08/c05)
- [ ] Thêm câu eval về scope sai cột (c12: `branch_id = "Chi nhánh TP.HCM"`) và kiểm tra scope_column có kiểu dữ liệu khớp
- [ ] Cạnh đồ thị theo thuật ngữ được định nghĩa ("nợ xấu" → PL-3) để không phụ thuộc dẫn chiếu tường minh
- [ ] (tuỳ chọn) Chuyển SQLite → Postgres với role read-only, đo lại eval
