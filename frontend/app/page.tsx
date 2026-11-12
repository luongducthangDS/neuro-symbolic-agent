"use client";

import { useState, useEffect, useCallback } from "react";
import VerdictBanner from "@/components/VerdictBanner";
import RulesTable from "@/components/RulesTable";
import TraceTimeline from "@/components/TraceTimeline";
import ClauseGraph from "@/components/ClauseGraph";
import { askQuestion, fetchGraph, checkHealth } from "@/lib/api";
import type { AskResponse, GraphData, Verdict } from "@/lib/types";

const SAMPLE_QUESTIONS = [
  "Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu?",
  "Khách hàng có liên quan nào vượt giới hạn dư nợ?",
  "Tổng dư nợ nhóm 2 của toàn công ty là bao nhiêu?",
  "LTV tối đa cho tài sản bảo đảm là ô tô?",
  "Chi nhánh Hải Phòng có vi phạm tỷ lệ nợ xấu không?",
  "Xóa toàn bộ khoản vay đã tất toán",
];

type Status = "idle" | "loading" | "done" | "error";

function FeaturePill({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="glass rounded-xl p-3 flex items-start gap-3">
      <span className="text-lg mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1.5 items-center justify-center py-8">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-blue-400"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.6);opacity:.3} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  );
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchGraph().then(setGraph).catch(() => {});
  }, []);

  const submit = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || status === "loading") return;
    setQuestion(trimmed);
    setStatus("loading");
    setResult(null);
    setError("");
    try {
      const data = await askQuestion(trimmed);
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [status]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); submit(question); };

  const verdict = result?.verification?.verdict as Verdict | undefined;
  const facts = result?.verification?.facts ?? [];
  const failCount = facts.filter(f => f.status === "FAIL").length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        {/* Gradient bg */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/8 to-emerald-600/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.08)_0%,transparent_60%)]" />

        <div className="relative max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl shadow-lg">
                ⚖️
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0f1117]" />
            </div>
            <div>
              <h1 className="font-bold text-lg gradient-text leading-tight">Compliance Agent</h1>
              <p className="text-xs text-slate-500">An Phát Finance · Snapshot 2026-09-30</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a href="https://github.com/luongducthangDS/neuro-symbolic-agent" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors glass px-3 py-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              healthy === null ? "text-slate-500 border-slate-700 bg-slate-800/50"
              : healthy ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : "text-red-400 border-red-500/30 bg-red-500/10"
            }`}>
              {healthy === null ? "⋯ connecting" : healthy ? "● API live" : "○ offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left panel */}
        <aside className="lg:col-span-2 space-y-4">

          {/* Input card */}
          <div className="glass rounded-2xl p-5">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                Câu hỏi tuân thủ
              </label>
              <div className="relative">
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Ví dụ: Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu?"
                  rows={3}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-slate-200 placeholder-slate-600
                    focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/40 resize-none transition-all"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(question); } }}
                />
              </div>
              <button type="submit" disabled={status === "loading" || !question.trim()}
                className="w-full relative overflow-hidden rounded-xl py-2.5 text-sm font-semibold transition-all
                  bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
                  disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500
                  text-white shadow-lg shadow-blue-500/20 disabled:shadow-none"
              >
                {status === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Đang phân tích…
                  </span>
                ) : "Kiểm tra →"}
              </button>
            </form>
          </div>

          {/* Sample questions */}
          <div className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Câu hỏi mẫu</p>
            <div className="flex flex-col gap-1.5">
              {SAMPLE_QUESTIONS.map(q => (
                <button key={q} onClick={() => { setQuestion(q); submit(q); }} disabled={status === "loading"}
                  className="text-left text-xs px-3 py-2 rounded-lg text-slate-400 glass-hover border border-transparent
                    hover:border-white/10 hover:text-slate-200 transition-all disabled:opacity-40 truncate"
                  title={q}
                >
                  <span className="text-slate-600 mr-1.5">▸</span>{q}
                </button>
              ))}
            </div>
          </div>

          {/* Graph */}
          {graph && <ClauseGraph data={graph} />}
        </aside>

        {/* Right panel */}
        <main className="lg:col-span-3 space-y-4">

          {/* Idle state */}
          {status === "idle" && (
            <div className="glass rounded-2xl p-8 text-center animate-fade-up">
              <div className="text-5xl mb-4">⚖️</div>
              <h2 className="text-lg font-semibold text-slate-200 mb-2">Kiểm tra tuân thủ tín dụng</h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                Nhập câu hỏi hoặc chọn câu mẫu. Mọi kết luận PASS/FAIL đều tất định — không phụ thuộc LLM.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <FeaturePill icon="🕸️" label="GraphRAG" desc="Dẫn chiếu chéo điều khoản qua đồ thị + vector" />
                <FeaturePill icon="🛡️" label="Text-to-SQL" desc="Tự sửa lỗi, chặn literal bịa, full-scan guard" />
                <FeaturePill icon="✓" label="Verifier" desc="PASS/FAIL tất định từ code, không từ LLM" />
              </div>
            </div>
          )}

          {/* Loading */}
          {status === "loading" && (
            <div className="glass rounded-2xl p-8">
              <LoadingDots />
              <p className="text-center text-sm text-slate-500 mt-2">Đang truy xuất điều khoản, tạo SQL và kiểm chứng…</p>
              {healthy === false && (
                <p className="text-center text-xs text-amber-400/80 mt-3 bg-amber-500/5 border border-amber-500/10 rounded-lg px-4 py-2">
                  API đang khởi động (Render cold start ~30s)…
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="glass rounded-2xl p-5 border border-red-500/30 bg-red-500/5 animate-slide-in">
              <p className="text-sm font-semibold text-red-400 mb-1">Lỗi kết nối</p>
              <p className="text-xs text-red-400/70">{error}</p>
            </div>
          )}

          {/* Result */}
          {status === "done" && result && (
            <>
              {verdict && verdict !== "NO_RULE" && (
                <VerdictBanner verdict={verdict} failCount={failCount} totalCount={facts.length} />
              )}

              {/* Answer card */}
              {result.answer && (
                <div className="animate-fade-up glass rounded-2xl p-5" style={{ animationDelay: "0.05s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Phân tích</h3>
                    {result.narrative_status === "grounded_after_retry" && (
                      <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">đã kiểm tra số</span>
                    )}
                    {result.narrative_status === "fallback_template" && (
                      <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">LLM không tin cậy</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                </div>
              )}

              {/* Rules table */}
              {facts.length > 0 && (
                <div style={{ animationDelay: "0.1s" }}>
                  <RulesTable facts={facts} />
                </div>
              )}

              {/* Retrieved clauses */}
              {result.retrieved && result.retrieved.length > 0 && (
                <details className="animate-fade-up glass rounded-2xl overflow-hidden" style={{ animationDelay: "0.15s" }}>
                  <summary className="px-5 py-3 cursor-pointer text-xs font-semibold text-slate-400 uppercase tracking-widest hover:text-slate-200 transition-colors">
                    Điều khoản truy xuất ({result.retrieved.length})
                  </summary>
                  <div className="px-5 pb-4 pt-1 flex flex-wrap gap-2">
                    {result.retrieved.map(c => (
                      <span key={c.id}
                        className="text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-lg"
                        title={`score: ${c.score?.toFixed(3)}`}
                      >
                        {c.id}
                        {c.hop !== undefined && c.hop > 0 && <span className="ml-1 text-blue-500">+{c.hop}hop</span>}
                      </span>
                    ))}
                  </div>
                </details>
              )}

              {/* Trace */}
              <div style={{ animationDelay: "0.2s" }}>
                <TraceTimeline trace={result.trace ?? []} attempts={result.attempts ?? []} />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] py-3 text-center text-xs text-slate-700">
        Dữ liệu hư cấu (An Phát Finance) · snapshot 2026-09-30 · Gemini flash-lite ·{" "}
        <a href="https://github.com/luongducthangDS/neuro-symbolic-agent" className="hover:text-slate-500 transition-colors">GitHub</a>
      </footer>
    </div>
  );
}
