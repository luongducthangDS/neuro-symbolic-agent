"use client";

import { useState, useEffect, useCallback } from "react";
import VerdictBanner from "@/components/VerdictBanner";
import RulesTable from "@/components/RulesTable";
import TraceTimeline from "@/components/TraceTimeline";
import ClauseGraph from "@/components/ClauseGraph";
import { askQuestion, fetchGraph, checkHealth } from "@/lib/api";
import type { AskResponse, GraphData, Verdict } from "@/lib/types";

const SAMPLES = [
  { label: "Chi nhánh vi phạm nợ xấu",        q: "Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu?" },
  { label: "Khách hàng liên quan vượt giới hạn", q: "Khách hàng có liên quan nào vượt giới hạn dư nợ?" },
  { label: "Dư nợ nhóm 2 toàn công ty",        q: "Tổng dư nợ nhóm 2 của toàn công ty là bao nhiêu?" },
  { label: "LTV tối đa tài sản ô tô",           q: "LTV tối đa cho tài sản bảo đảm là ô tô?" },
  { label: "Hải Phòng có vi phạm không?",       q: "Chi nhánh Hải Phòng có vi phạm tỷ lệ nợ xấu không?" },
  { label: "🛡 Test write-guard",               q: "Xóa toàn bộ khoản vay đã tất toán" },
];

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchGraph().then(setGraph).catch(() => {});
  }, []);

  const submit = useCallback(async (question: string) => {
    const t = question.trim();
    if (!t || status === "loading") return;
    setQ(t); setStatus("loading"); setResult(null); setError("");
    try {
      setResult(await askQuestion(t));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [status]);

  const verdict  = result?.verification?.verdict as Verdict | undefined;
  const facts    = result?.verification?.facts ?? [];
  const failCount = facts.filter(f => f.status === "FAIL").length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">

        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm flex-shrink-0">⚖</div>
            <div>
              <p className="font-semibold text-sm text-slate-800 leading-tight">Compliance Agent</p>
              <p className="text-[10px] text-slate-400 mt-0.5">An Phát Finance</p>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-4 border-b border-slate-100">
          <form onSubmit={e => { e.preventDefault(); submit(q); }}>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Câu hỏi
            </label>
            <textarea
              value={q}
              onChange={e => setQ(e.target.value)}
              rows={4}
              placeholder="Nhập câu hỏi tuân thủ…"
              className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5
                placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(q); }}}
            />
            <button
              type="submit"
              disabled={status === "loading" || !q.trim()}
              className="mt-2.5 w-full py-2 rounded-lg text-sm font-medium transition-all
                bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              {status === "loading"
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    Phân tích…
                  </span>
                : "Kiểm tra →"
              }
            </button>
          </form>
        </div>

        {/* Sample questions */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Câu hỏi mẫu</p>
          <div className="space-y-0.5">
            {SAMPLES.map(s => (
              <button key={s.q}
                onClick={() => { setQ(s.q); submit(s.q); }}
                disabled={status === "loading"}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-40 truncate"
                title={s.q}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Graph */}
        <div className="p-4 flex-1">
          {graph
            ? <ClauseGraph data={graph} />
            : <div className="rounded-xl bg-slate-50 border border-slate-200 h-48 flex items-center justify-center text-xs text-slate-400">Đang tải đồ thị…</div>
          }
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-medium flex items-center gap-1 ${
              healthy === null ? "text-slate-400" : healthy ? "text-emerald-600" : "text-red-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${healthy ? "bg-emerald-500" : healthy === false ? "bg-red-500" : "bg-slate-300"}`}/>
              {healthy === null ? "Connecting…" : healthy ? "API live" : "API offline"}
            </span>
            <a href="https://github.com/luongducthangDS/neuro-symbolic-agent" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
              GitHub ↗
            </a>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 px-8 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-800 text-sm">Kiểm tra tuân thủ tín dụng</h1>
            <p className="text-xs text-slate-400 mt-0.5">Snapshot 2026-09-30 · GraphRAG + Text-to-SQL + Symbolic Verifier</p>
          </div>
          {status === "done" && verdict && (
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
              verdict === "PASS" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : verdict === "FAIL" ? "bg-red-50 text-red-700 border-red-200"
              : "bg-slate-50 text-slate-600 border-slate-200"
            }`}>
              {verdict}
            </span>
          )}
        </header>

        <div className="px-8 py-6 max-w-4xl space-y-4">

          {/* Idle */}
          {status === "idle" && (
            <div className="animate-up">
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-2xl mx-auto mb-4 shadow-sm shadow-blue-200">⚖️</div>
                <h2 className="font-semibold text-slate-700 text-base mb-1.5">Hệ thống kiểm tra tuân thủ</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  Nhập câu hỏi hoặc chọn câu mẫu ở sidebar. Kết luận PASS / FAIL được tính tất định bằng code — không phụ thuộc LLM.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { icon: "🕸️", title: "GraphRAG", desc: "Truy xuất điều khoản qua đồ thị dẫn chiếu chéo + vector similarity" },
                  { icon: "🛡️", title: "SQL Guard", desc: "AST validate, full-scan block, literal grounding, self-correction" },
                  { icon: "✓",  title: "Verifier",  desc: "So ngưỡng từng dòng dữ liệu, kết quả tất định, không LLM" },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xl mb-2">{icon}</div>
                    <p className="font-semibold text-slate-700 text-sm mb-1">{title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {status === "loading" && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center gap-4">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full bg-blue-500"
                    style={{animation:`dot-pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                ))}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Đang phân tích câu hỏi</p>
                <p className="text-xs text-slate-400 mt-1">Truy xuất điều khoản → tạo SQL → kiểm chứng…</p>
              </div>
              {healthy === false && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                  Render cold start ~30s, vui lòng chờ…
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 animate-up">
              <p className="font-medium text-red-700 text-sm">Lỗi kết nối</p>
              <p className="text-xs text-red-500 mt-1">{error}</p>
            </div>
          )}

          {/* Result */}
          {status === "done" && result && (
            <>
              {/* Question chip */}
              <div className="animate-up flex items-center gap-2">
                <span className="text-xs text-slate-400">Câu hỏi:</span>
                <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-full">{q}</span>
              </div>

              {/* Verdict */}
              {verdict && verdict !== "NO_RULE" && (
                <VerdictBanner verdict={verdict} failCount={failCount} totalCount={facts.length}/>
              )}

              {/* Answer */}
              {result.answer && (
                <div className="animate-up bg-white border border-slate-200 rounded-xl p-5" style={{animationDelay:"0.05s"}}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phân tích</span>
                    {result.narrative_status === "grounded_after_retry" && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Đã kiểm số</span>
                    )}
                    {result.narrative_status === "fallback_template" && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">LLM không tin cậy</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                </div>
              )}

              {/* Rules table */}
              {facts.length > 0 && (
                <div style={{animationDelay:"0.1s"}}><RulesTable facts={facts}/></div>
              )}

              {/* Retrieved clauses */}
              {(result.retrieved?.length ?? 0) > 0 && (
                <details className="animate-up bg-white border border-slate-200 rounded-xl overflow-hidden" style={{animationDelay:"0.15s"}}>
                  <summary className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors">
                    Điều khoản truy xuất ({result.retrieved.length})
                  </summary>
                  <div className="px-5 pb-4 pt-2 flex flex-wrap gap-2">
                    {result.retrieved.map(c => (
                      <span key={c.id} className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg">
                        {c.id}{(c.hop ?? 0) > 0 && <span className="ml-1 text-blue-400">+{c.hop}hop</span>}
                      </span>
                    ))}
                  </div>
                </details>
              )}

              {/* Trace */}
              <div style={{animationDelay:"0.2s"}}>
                <TraceTimeline trace={result.trace ?? []} attempts={result.attempts ?? []}/>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
