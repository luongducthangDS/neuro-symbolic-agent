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
  "Khách hàng là người có liên quan nào vượt giới hạn dư nợ?",
  "Có bao nhiêu khoản vay tiêu dùng vượt trần lãi suất 20%?",
  "LTV tối đa cho tài sản bảo đảm là ô tô là bao nhiêu?",
  "Chi nhánh Hải Phòng có vi phạm giới hạn tỷ lệ nợ xấu không?",
  "Xóa toàn bộ khoản vay đã tất toán",
];

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchGraph()
      .then(setGraph)
      .catch(() => {});
  }, []);

  const submit = useCallback(
    async (q: string) => {
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
    },
    [status]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(question);
  };

  const verdict = result?.verification?.verdict as Verdict | undefined;
  const facts = result?.verification?.facts ?? [];
  const failCount = facts.filter((f) => f.status === "FAIL").length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">⚖</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">
                Compliance Agent
              </h1>
              <p className="text-xs text-gray-500">
                An Phát Finance · GraphRAG + Text-to-SQL + Symbolic Verifier
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/luongducthangDS/neuro-symbolic-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                healthy === null
                  ? "bg-gray-100 text-gray-500"
                  : healthy
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {healthy === null ? "…" : healthy ? "API online" : "API offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel */}
        <aside className="lg:col-span-2 space-y-4">
          {/* Input */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                Câu hỏi tuân thủ
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ví dụ: Chi nhánh nào vi phạm giới hạn tỷ lệ nợ xấu?"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(question);
                  }
                }}
              />
              <button
                type="submit"
                disabled={status === "loading" || !question.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                {status === "loading" ? (
                  <>
                    <svg
                      className="animate-spin w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                    Đang phân tích…
                  </>
                ) : (
                  "Kiểm tra"
                )}
              </button>
            </form>
          </div>

          {/* Sample questions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Câu hỏi mẫu
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestion(q);
                    submit(q);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 transition-colors text-left"
                  disabled={status === "loading"}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Graph */}
          {graph && <ClauseGraph data={graph} />}
        </aside>

        {/* Right panel */}
        <main className="lg:col-span-3 space-y-4">
          {status === "idle" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-4xl mb-3">⚖️</p>
              <p className="text-gray-500 text-sm">
                Nhập câu hỏi hoặc chọn một câu mẫu để bắt đầu kiểm tra tuân thủ.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-400">
                <div className="bg-purple-50 rounded-lg p-2">
                  <p className="font-semibold text-purple-700">GraphRAG</p>
                  <p>Dẫn chiếu chéo điều khoản qua đồ thị + vector</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-2">
                  <p className="font-semibold text-orange-700">Text-to-SQL</p>
                  <p>Tự sửa lỗi SQL, chặn literal bịa, full-scan</p>
                </div>
                <div className="bg-teal-50 rounded-lg p-2">
                  <p className="font-semibold text-teal-700">Verifier</p>
                  <p>PASS/FAIL tất định, không phụ thuộc LLM</p>
                </div>
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500">
                  Đang truy xuất điều khoản, tạo SQL và kiểm chứng…
                </p>
                {healthy === false && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">
                    API đang khởi động (Render cold start ~30s), vui lòng chờ
                  </p>
                )}
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <p className="text-sm font-semibold text-red-700">Lỗi</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          )}

          {status === "done" && result && (
            <>
              {/* Verdict */}
              {verdict && verdict !== "NO_RULE" && (
                <VerdictBanner
                  verdict={verdict}
                  failCount={failCount}
                  totalCount={facts.length}
                />
              )}

              {/* Narrative */}
              {result.answer && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Phân tích
                    </h3>
                    {result.narrative_status === "grounded_after_retry" && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        đã kiểm tra số
                      </span>
                    )}
                    {result.narrative_status === "fallback_template" && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        LLM không tạo được câu tin cậy
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {result.answer}
                  </p>
                </div>
              )}

              {/* Rules table */}
              {facts.length > 0 && <RulesTable facts={facts} />}

              {/* Retrieved clauses */}
              {result.retrieved && result.retrieved.length > 0 && (
                <details className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <summary className="px-4 py-2.5 bg-gray-50 cursor-pointer text-sm font-semibold text-gray-700 uppercase tracking-wide hover:bg-gray-100">
                    Điều khoản truy xuất ({result.retrieved.length})
                  </summary>
                  <div className="p-4 flex flex-wrap gap-2">
                    {result.retrieved.map((c) => (
                      <span
                        key={c.id}
                        className="text-xs font-mono bg-blue-50 text-blue-800 px-2.5 py-1 rounded"
                        title={`score: ${c.score?.toFixed(3)}`}
                      >
                        {c.id}
                        {c.hop !== undefined && c.hop > 0 && (
                          <span className="ml-1 text-blue-400">+{c.hop}hop</span>
                        )}
                      </span>
                    ))}
                  </div>
                </details>
              )}

              {/* Trace */}
              <TraceTimeline
                trace={result.trace ?? []}
                attempts={result.attempts ?? []}
              />
            </>
          )}
        </main>
      </div>

      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
        Dữ liệu hư cấu (An Phát Finance) · snapshot 2026-09-30 · Gemini flash-lite
      </footer>
    </div>
  );
}
