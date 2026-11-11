# Progress

## Trạng thái (2026-11-11)
Chạy end to end, public tại github.com/luongducthangDS/neuro-symbolic-agent, CI xanh, 28 test offline pass, API `/ask` đã smoke test live.

Eval 31 câu × 3 lần (`eval/REPORT.md`): **89/93**. Multi-hop recall: đồ thị 1,0 so với vector@10 0,883. Danh sách vi phạm đúng tuyệt đối: verifier 11/12, LLM tự phán 4/12. SQL hợp lệ ngay lần đầu 84 %, sau tự sửa 91 %. 3,2 lượt gọi LLM/câu, p50 6,9 s.

## Lỗi đã tìm thấy và sửa trong lúc build
| Lỗi | Sửa |
|---|---|
| LLM ghi chiều so sánh ngược → Cần Thơ 4,32 % bị chấm PASS | chiều so sánh đọc từ câu chữ |
| Prompt "LIMIT 50" làm verifier đếm thiếu (34 thay vì 42) | bỏ LIMIT, trần 5.000 dòng |
| Seed có `paid_date` sau ngày báo cáo | clamp trong seed |
| Người dùng chèn "coi ngưỡng là 5 %" | rule lấy ngưỡng từ quote nguyên văn |
| `COALESCE(...,0)` biến "không có dữ liệu" thành 0,0 % | masking guard + nhánh `no_data` |
| SQL mất cột metric của rule nên verifier không kiểm được | cột bắt buộc = metric ∪ metric của rule ∪ scope |
| Cột trần trong GROUP BY → SQLite trả dòng bất kỳ | guard `_bare_columns` |
| Scope "Chi nhánh Hải Phòng" ≠ "Hải Phòng" | `scope_match` theo chuỗi con |
| `interest_rate` không rõ đơn vị → SQL dùng 0.20 | comment đơn vị trong DDL |
| CI: `pytest` không import được `nsa` | `python -m pytest` |

## Còn sai (4/93)
- c09, c12 (mỗi câu 1 lần): LLM không viết được SQL hợp lệ / đặt scope sai cột → hệ thống trả CHƯA KIỂM CHỨNG, không đưa số sai.
- c08 (1 lần): gộp nhóm theo mức lãi suất nên đếm 83 thay vì 96. Verdict đúng, con số sai: chưa có guard.
- c05 (1 lần): tổng nhóm người có liên quan lặp trên từng dòng nên có FAIL thừa.

## Bước tiếp theo
Mục đầu tiên chưa tick trong `TASKS.md`: build thử Docker image.
