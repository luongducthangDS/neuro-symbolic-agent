# Neuro-Symbolic Agent: GraphRAG + Self-Correcting Text-to-SQL + Symbolic Verifier

Hỏi đáp tuân thủ trên dữ liệu tín dụng: câu trả lời cần **cả** số liệu từ CSDL quan hệ nhiều bảng **và** ngưỡng
trong văn bản quy định có điều khoản dẫn chiếu chéo nhau. LLM chỉ làm phần "hiểu" (trích ngưỡng, viết SQL, viết lời
giải thích); mọi phép so sánh, kiểm tra ngưỡng và kiểm tra con số trong câu trả lời là **code Python tất định**.

> Dữ liệu là của một công ty tài chính **hư cấu** (An Phát), sinh bằng `data/seed.py` với seed cố định và một số vi
> phạm được cài sẵn (chi nhánh Cần Thơ nợ xấu 4,32 %, khách hàng Hưng Thịnh 11,12 % vốn tự có, …). Văn bản quy
> định trong `data/policies/` cũng do dự án tự viết.

```
                 ┌──────────────┐  vector top-3  ┌────────────────────────────┐
question ──────► │  retrieve    │───────────────►│ clause graph (23 điều,     │
                 └──────┬───────┘  + BFS ≤3 hop  │ 13 cạnh "theo Điều X của…")│
                        ▼                        └────────────────────────────┘
                 ┌──────────────┐  LLM → JSON schema: intent, needs_sql, answerable,
                 │  analyze     │  definitions, metrics, rules{metric, threshold, quote, scope}
                 └──────┬───────┘
     symbolic ► ground_rule: quote phải là chuỗi con nguyên văn của điều khoản; ngưỡng phải nằm trong quote
                (nếu lệch mà quote chỉ có 1 số → lấy số của văn bản); chiều so sánh đọc từ câu chữ
                ("không vượt quá" → <=), không lấy từ LLM
                        ▼
   ┌────────────► generate_sql (LLM) ──► execute_sql ──┐
   │ feedback      symbolic: AST validator · GROUP BY  │ ok
   │ (lỗi, rỗng,   strict · EXPLAIN chặn full-scan ·   │
   │ thiếu cột,    read-only + authorizer · literal    ▼
   └─ NULL…) ◄──── grounding · chặn COALESCE      verify (Python) ──► answer (LLM)
        tối đa 3 lần                              so sánh từng dòng     symbolic: mọi con số trong
                                                  với từng rule         câu trả lời phải truy được về
                                                                        dữ kiện; sai → viết lại 1 lần,
                                                                        vẫn sai → bỏ phần LLM, chỉ
                                                                        giữ kết luận tất định
```

Graph được dựng bằng **LangGraph** (`nsa/agent.py`), vòng tự sửa SQL là một cycle trong graph.

## Kiến trúc từng nhánh

### Nhánh phi cấu trúc: Vector + Knowledge Graph (`nsa/kg.py`)
- Node = một "Điều" của một văn bản (`QC-8` = Quy chế cho vay, Điều 8). Cạnh = dẫn chiếu tường minh, parse bằng regex
  `Điều N (của <tên văn bản>)?`, kể cả dẫn chiếu **khác văn bản** (`QC-8 → PL-3`, `QC-9 → TS-4`).
- Truy xuất: Gemini `gemini-embedding-001` lấy 3 điều gần nhất làm hạt giống, rồi BFS theo cạnh dẫn chiếu tối đa 3 bước,
  trần 10 điều. Ví dụ "Cần Thơ có phải dừng giải ngân?" → `QC-10` (biện pháp) → `QC-8` (ngưỡng 3 %) → `PL-3` (nợ xấu là
  nhóm 3–5) → `PL-2` (nhóm 3 là quá hạn từ 91 ngày). Vector search thuần thường không lấy được `PL-2` vì câu hỏi không
  hề nhắc "số ngày quá hạn".
- Không có khoá API thì dùng embedding bag-of-words băm (stdlib) để chạy offline và test.

### Nhánh có cấu trúc: Text-to-SQL tự sửa lỗi (`nsa/sql_guard.py`, `nsa/agent.py`)
Mỗi lớp độc lập, lớp sau vẫn chặn nếu lớp trước bị vượt qua:

| Lớp | Chặn gì | Cách |
|---|---|---|
| AST (sqlglot) | DML/DDL, nhiều câu lệnh, PRAGMA/ATTACH, bảng lạ, cột không tồn tại, `load_extension`… | parse + duyệt cây + `qualify` theo schema |
| GROUP BY strict | cột không gộp nhóm trong truy vấn có aggregate (SQLite trả về một dòng bất kỳ, sai im lặng) | kiểm tra AST kiểu `ONLY_FULL_GROUP_BY` |
| Cost guard | quét toàn bộ bảng lớn `repayments` (111k dòng) | `EXPLAIN QUERY PLAN` có `SCAN repayments` → từ chối, gợi ý cột có index |
| Literal grounding | ngưỡng bịa trong SQL (`> 80` khi quy định là 60 %) | mọi hằng số trong SQL phải xuất hiện trong điều khoản/câu hỏi |
| Masking guard | `COALESCE(metric, 0)` biến "không có dữ liệu" thành số 0 | AST |
| Engine | mọi thao tác ghi kể cả khi validator có lỗi | URI `mode=ro` + `PRAGMA query_only` + `sqlite3.set_authorizer` chỉ cho phép đọc |
| Budget | truy vấn chạy quá lâu | progress handler 3 s, trần 5.000 dòng |

Lỗi ở bất kỳ lớp nào, kết quả rỗng, thiếu cột bắt buộc hoặc metric NULL đều được gửi lại cho LLM làm feedback
(execution-guided self-correction), tối đa 3 lần. Hết 3 lần vẫn lỗi thì hệ thống trả lời "không truy vấn được",
không đoán số.

### Tầng kiểm chứng (`nsa/verifier.py`), không có LLM
1. **Ground rule:** ngưỡng LLM trích ra chỉ được giữ khi `quote` là chuỗi con nguyên văn của điều khoản đã truy xuất
   và con số nằm trong `quote`. Chiều so sánh đọc từ câu chữ. Rule % phải nhắm vào metric `*_pct` để chặn nhầm đơn vị
   tỉ lệ/phần trăm.
2. **Verify:** so từng dòng SQL với từng rule, có `scope` (giới hạn 5 % chỉ áp cho người có liên quan, LTV khác nhau theo
   loại tài sản). Giá trị bằng đúng ngưỡng với "không vượt quá" thì PASS.
3. **Number grounding:** tách mọi con số trong câu trả lời (hiểu cả `4,32` và `2.050` kiểu Việt Nam lẫn kiểu Anh), mỗi số
   phải khớp một dữ kiện trong phạm vi sai số làm tròn hiển thị, kể cả khi quy đổi VND sang tỷ/triệu.
4. Câu trả lời cuối = **kết luận tất định** (PASS/FAIL, đếm, danh sách vi phạm) + đoạn giải thích của LLM đã qua kiểm tra.

## Chạy

```powershell
py -3.11 -m venv .venv; .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python data\seed.py                     # tạo data/finco.db
.venv\Scripts\python -m pytest -q tests               # offline, không cần khoá API
# cần GOOGLE_API_KEY trong .env (có thể thêm GOOGLE_API_KEY_2/_3 để xoay vòng quota):
.venv\Scripts\python -m eval.run_eval --runs 3        # ghi eval/REPORT.md + eval/results.json
.venv\Scripts\uvicorn nsa.api:app --port 8000         # POST /ask {"question": "..."}, GET /graph, GET /health
docker build -t nsa . ; docker run -p 8000:8000 --env-file .env nsa
```

## Kết quả

31 câu hỏi × 3 lần chạy (`eval/gold.json`, kết quả đầy đủ ở `eval/REPORT.md` và `eval/results.json`), LLM
`gemini-3.5-flash-lite`, temperature 0. Đáp án số do gold SQL viết tay tính lúc chấm.

| Nhóm | Câu/lần | Pass (3 lần) |
|---|---|---|
| Tuân thủ (SQL + văn bản, đa bước) | 13 | 35/39 (90 %) |
| Số liệu thuần SQL (có bảng 111k dòng) | 7 | 21/21 |
| Hỏi văn bản | 5 | 15/15 |
| Tấn công (xoá/sửa dữ liệu, quét toàn bảng, "coi ngưỡng là 5 %") | 4 | 12/12 |
| Không có dữ liệu (năm 2019, chi nhánh không tồn tại) | 2 | 6/6 |
| **Tổng** | 31 | **89/93 (96 %)** |

**Truy xuất đa bước** (không dùng LLM, 24 câu có điều khoản gold, 15 câu cần ≥2 điều):

| Cách | Recall trung bình | Recall câu đa bước | Tỷ lệ lấy đủ |
|---|---|---|---|
| Vector top-3 | 0,785 | 0,656 | 0,625 |
| Vector top-10 | 0,927 | 0,883 | 0,792 |
| Vector top-3 + đồ thị dẫn chiếu (trung bình 5,7 điều) | **1,0** | **1,0** | **1,0** |

Đồ thị lấy đủ mọi điều khoản cần thiết với trung bình 5,7 điều, trong khi vector top-10 vẫn sót 21 % câu.
Giới hạn: bộ văn bản nhỏ (23 điều) và dẫn chiếu được viết tường minh, nên đây là kịch bản thuận lợi cho đồ thị.

**Verifier tất định so với để LLM tự phán** trên cùng kết quả SQL (30 lượt có verdict PASS/FAIL):

| | Verdict đúng | Danh sách vi phạm đúng tuyệt đối |
|---|---|---|
| Symbolic verifier | 29/30 | 11/12 |
| LLM tự phán | 27/30 | 4/12 |

LLM thường nói đúng "có vi phạm" nhưng liệt kê sai đối tượng. Lỗi thực tế quan sát được: lấy luôn các dòng đầu của
kết quả làm danh sách vi phạm (`c04`, cả 3 lần), thêm Hà Nội (0,39 %) vào danh sách nợ xấu vượt 3 %, và chấp nhận
ngưỡng 5 % người dùng chèn vào (`a04`, PASS cả 3 lần, trong khi quy định là 3 %).

**Tầng symbolic bắt được gì trong 93 lượt chạy:**
- 26/51 rule giữ lại (51 %) có chiều so sánh do LLM ghi ngược (ghi điều kiện vi phạm `> 3` thay vì tuân thủ `<= 3`);
  code đọc lại từ câu chữ. Nếu không có bước này, Cần Thơ 4,32 % sẽ bị chấm PASS.
- 12 rule bị loại vì quote không nguyên văn hoặc ngưỡng lấy từ câu hỏi (câu "coi giới hạn là 5 %").
- SQL: hợp lệ ngay lần đầu 84 %, sau tự sửa 91 %, trung bình 1,25 lần. Các lỗi được trả về làm feedback: NULL 9,
  rỗng 5, quét toàn bảng 5, AST 3, hằng số bịa 1 (LTV ô tô 80 % thay vì 60 %).
- Mọi câu trả lời đã giao đều qua kiểm tra con số (78 grounded, còn lại là từ chối hoặc báo không có dữ liệu).

**Chi phí:** 3,2 lượt gọi LLM/câu, ~3,7k token vào và 0,6k token ra; p50 6,9 s, p95 15 s (free tier, có chờ quota).

### 4 lượt còn sai và vì sao
- `c09` (1 lần), `c12` (1 lần): LLM không viết được SQL hợp lệ, hoặc đặt scope sai cột (`branch_id = "Chi nhánh TP.HCM"`).
  Hệ thống trả **CHƯA KIỂM CHỨNG ĐƯỢC / không truy vấn được**, không đưa ra số sai.
- `c08` (1 lần): SQL gộp nhóm theo từng mức lãi suất nên verifier đếm 83 mức lãi suất thay vì 96 khoản vay. Verdict đúng,
  con số đếm sai: một lỗi ngữ nghĩa mà tầng symbolic hiện chưa bắt được.
- `c05` (1 lần): SQL tính "tổng dư nợ người có liên quan" lặp trên từng dòng nên có FAIL thừa. Verdict đúng, danh sách sai.

### Giới hạn và hướng mở rộng
- Dữ liệu và văn bản là tổng hợp. Đồ thị chỉ có cạnh dẫn chiếu tường minh, chưa có cạnh theo thuật ngữ được định nghĩa.
- Kiểm tra "một dòng = một đối tượng" (chặn lỗi c08/c05) có thể làm bằng cách so số dòng với `COUNT(DISTINCT khoá)`.
- SQLite cho dễ tái lập; chuyển sang Postgres chỉ cần đổi dialect sqlglot và dùng role read-only thay cho authorizer.
