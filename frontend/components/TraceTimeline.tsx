"use client";
import { useState } from "react";
import type { TraceStep } from "@/lib/types";

const NODE_STYLE: Record<string, string> = {
  retrieve:     "bg-purple-500/15 text-purple-300 border-purple-500/30",
  analyze:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
  generate_sql: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  execute_sql:  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  verify:       "bg-teal-500/15 text-teal-300 border-teal-500/30",
  answer:       "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  refuse:       "bg-slate-500/15 text-slate-400 border-slate-500/30",
  no_data:      "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

interface Props {
  trace: TraceStep[];
  attempts: { sql: string; error: string | null; stage: string }[];
}

export default function TraceTimeline({ trace, attempts }: Props) {
  const [open, setOpen] = useState(false);
  if (!trace.length) return null;

  const totalMs = trace.reduce((s, t) => s + t.ms, 0);
  const retries = attempts.filter(a => a.error).length;

  return (
    <div className="animate-fade-up glass rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Trace pipeline</span>
          {retries > 0 && (
            <span className="text-xs font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
              {retries} SQL retry
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 flex items-center gap-1.5">
          <span className="text-slate-300 font-medium">{(totalMs / 1000).toFixed(1)}s</span>
          <span>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-white/[0.05] pt-3 space-y-3">
          {/* Steps */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {trace.map((step, i) => {
              const isRetry = step.node === "generate_sql" && (step.attempt as number) > 1;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-lg font-mono border ${NODE_STYLE[step.node] ?? "bg-white/5 text-slate-400 border-white/10"} ${isRetry ? "ring-1 ring-orange-400/50" : ""}`}
                    title={JSON.stringify(step, null, 2)}
                  >
                    {step.node}{step.node === "generate_sql" ? ` #${step.attempt}` : ""}
                    <span className="ml-1 opacity-50">{step.ms}ms</span>
                  </span>
                  {i < trace.length - 1 && <span className="text-slate-700 text-xs">→</span>}
                </div>
              );
            })}
          </div>

          {/* SQL attempts */}
          {attempts.length > 0 && (
            <div className="space-y-2 mt-1">
              {attempts.map((att, i) => (
                <div key={i} className="rounded-xl bg-black/30 border border-white/[0.05] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-slate-500">attempt {i + 1}</span>
                    {att.error
                      ? <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">{att.stage}: {att.error.slice(0, 80)}{att.error.length > 80 ? "…" : ""}</span>
                      : <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">OK</span>
                    }
                  </div>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all font-mono leading-relaxed">
                    {att.sql}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
