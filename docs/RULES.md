# Rules

## Bất biến của hệ thống (không bao giờ gỡ hoặc nới lỏng)
- Mọi phép so sánh với ngưỡng, mọi phép đếm vi phạm là **code Python**, không bao giờ để LLM làm.
- Chiều so sánh đọc từ câu chữ điều khoản (`compliance_operator`), không lấy từ LLM: LLM ghi ngược trong khoảng 50 % rule.
- Ngưỡng chỉ hợp lệ khi quote là chuỗi con nguyên văn của điều khoản đã truy xuất.
- SQL chỉ chạy qua `Database.run`: AST validator → EXPLAIN guard → kết nối read-only + authorizer. Không thêm đường chạy SQL nào khác.
- Không thêm `LIMIT` vào SQL dùng cho verifier; chỉ cắt phần dữ liệu gửi cho LLM.
- Không cho phép COALESCE/IFNULL trên cột metric, không cho phép cột trần trong truy vấn có GROUP BY.
- Câu trả lời có số không truy được về dữ kiện thì không giao: bỏ đoạn LLM, chỉ giữ kết luận tất định.
- Không có dữ liệu thì nói không có, không đoán.

## Quy ước code
- Ít file, ít trừu tượng; giới hạn hoặc đơn giản hoá có chủ đích thì đánh dấu bằng comment `# ponytail:`.
- Logic mới ở tầng symbolic/guard phải có test offline trong `tests/test_nsa.py`; test không gọi mạng (dùng `ScriptedLLM`, `bow_embed`).
- Chạy test bằng `python -m pytest -q tests` (gọi `pytest` trực tiếp sẽ không import được `nsa`).
- Sửa prompt hoặc guard thì chạy lại `python -m eval.run_eval --runs 3` và cập nhật số trong README.
- Số trong README/tài liệu phải lấy từ `eval/REPORT.md` hoặc lệnh đã chạy, không ước lượng.

## AI không bao giờ được
- Ghi secret vào file được commit (`.env` đã gitignore; chỉ ghi tên biến).
- Sửa `eval/gold.json` cho khớp với output của agent; gold chỉ được sửa khi gold sai so với dữ liệu/văn bản, và phải ghi lý do.
- Push lên `main` khi test offline đỏ.
- Trình bày dữ liệu hư cấu như dữ liệu thật.
