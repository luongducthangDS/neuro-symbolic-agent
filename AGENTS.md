# neuro-symbolic-agent: agent notes

Đọc trước khi làm: [docs/RULES.md](docs/RULES.md) (bất biến, không được gỡ) > [docs/PRD.md](docs/PRD.md) > [ARCHITECTURE](docs/ARCHITECTURE.md), [DESIGN](docs/DESIGN.md), [TASKS](docs/TASKS.md), [PROGRESS](docs/PROGRESS.md).

## Trạng thái (2026-11-11)
- Đã xong end to end: GraphRAG + Text-to-SQL tự sửa lỗi + symbolic verifier (LangGraph, FastAPI). Public tại github.com/luongducthangDS/neuro-symbolic-agent, CI xanh.
- Eval 31 câu × 3 lần: 89/93. Chi tiết và lỗi còn lại xem `docs/PROGRESS.md`.
- Việc tiếp theo: mục đầu tiên chưa tick trong `docs/TASKS.md` (build thử Docker).
- Dữ liệu và văn bản là hư cấu (`data/seed.py`, seed 42, ngày báo cáo 2026-09-30); `data/finco.db` gitignored, chạy seed để tạo lại.

## Gotchas
- `.env` (gitignored) có `GOOGLE_API_KEY`, `_2`, `_3` copy từ `DocuMindAI/.env`; `nsa/llm.py` xoay key khi gặp 429. `gemini-3.5-flash` chỉ có 20 request/ngày trên free tier, nên fallback sang nó dễ hết quota.
- Chạy test bằng `python -m pytest -q tests`, với `GOOGLE_API_KEY=` rỗng; test không gọi mạng.
- Console Windows dùng cp1252: script in tiếng Việt cần `PYTHONUTF8=1`. Gửi tiếng Việt bằng curl của Git Bash bị hỏng encoding: dùng `--data-binary @file.json`.
- Heredoc bash có `'''` lồng nhau dễ vỡ: viết script ra file rồi chạy.
- Một lượt eval 3 lần mất khoảng 10 phút, nên chạy nền.
