"use client";
import { useState } from "react";
import type { TraceStep } from "@/lib/types";

const NODE: Record<string, string> = {
  retrieve:     "bg-violet-50 text-violet-700 border-violet-200",
  analyze:      "bg-blue-50 text-blue-700 border-blue-200",
  generate_sql: "bg-orange-50 text-orange-700 border-orange-200",
  execute_sql:  "bg-orange-50 text-orange-700 border-orange-200",
  verify:       "bg-teal-50 text-teal-700 border-teal-200",
  answer:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  refuse:       "bg-slate-100 text-slate-500 border-slate-200",
  no_data:      "bg-slate-100 text-slate-500 border-slate-200",
};

export default function TraceTimeline({ trace, attempts }: {
  trace: TraceStep[];
  attempts: { sql: string; error: string | null; stage: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (!trace.length) return null;
  const totalMs = trace.reduce((s, t) => s + t.ms, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-up">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pipeline trace</span>
          {attempts.some(a => a.error) && (
            <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">SQL retry</span>
          )}
        </div>
        <span className="text-xs text-slate-400">{(totalMs / 1000).toFixed(1)}s {open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            {trace.map((step, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={`text-xs px-2.5 py-1 rounded-md border font-mono ${NODE[step.node] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
                  {step.node}{step.node === "generate_sql" ? ` #${step.attempt}` : ""}
                  <span className="ml-1 opacity-40 text-[10px]">{step.ms}ms</span>
                </span>
                {i < trace.length - 1 && <span className="text-slate-300">›</span>}
              </div>
            ))}
          </div>
          {attempts.map((a, i) => (
            <div key={i} className="rounded-lg border border-slate-200 overflow-hidden">
              <div className={`px-3 py-1.5 text-xs font-medium border-b border-slate-100 flex items-center gap-2 ${a.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                <span>Attempt {i + 1}</span>
                {a.error ? <span className="font-normal opacity-70">{a.stage}: {a.error.slice(0, 80)}</span> : <span>OK</span>}
              </div>
              <pre className="px-3 py-2 text-xs text-slate-600 font-mono whitespace-pre-wrap break-all bg-slate-50/50 leading-relaxed">{a.sql}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
