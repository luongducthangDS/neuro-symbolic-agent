# PRD: Neuro-Symbolic Compliance Agent

## Vấn đề
Câu hỏi tuân thủ tín dụng cần kết hợp **số liệu** (CSDL quan hệ nhiều bảng) với **ngưỡng trong văn bản quy định**, mà các điều khoản lại dẫn chiếu chéo nhau. LLM thuần dễ bịa số, bịa ngưỡng, so sánh ngược chiều.

## Người dùng
- Chuyên viên quản trị rủi ro / kiểm soát nội bộ của một công ty tài chính (hư cấu: An Phát), hỏi bằng tiếng Việt.
- Phụ: người đọc portfolio (nhà tuyển dụng AI Engineer) cần thấy rõ kiến trúc và số đo. (unverified: mục đích portfolio suy ra từ lộ trình của user)

## Mục tiêu
1. Trả lời câu hỏi tuân thủ có kết luận PASS/FAIL **tất định**, kèm dẫn chiếu điều khoản.
2. Truy xuất đa bước qua dẫn chiếu chéo (vector + đồ thị).
3. Text-to-SQL an toàn: chỉ đọc, chặn lệnh nguy hiểm và quét toàn bảng lớn, tự sửa lỗi theo kết quả thực thi.
4. Không con số nào trong câu trả lời mà không truy được về dữ liệu hoặc văn bản.
5. Có bộ eval tái lập, đo được từng tầng (retrieval, SQL, verifier, end-to-end).

## Không làm
- Ghi/sửa dữ liệu (mọi yêu cầu ghi đều bị từ chối).
- Dữ liệu thật, đa tenant, phân quyền người dùng (thuộc Dự án 1).
- UI web; chỉ có API + CLI eval.
- Lịch sử nhiều kỳ: CSDL là một snapshot tại 2026-09-30.
