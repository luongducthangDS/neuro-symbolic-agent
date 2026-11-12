"use client";
import { useState } from "react";
import type { TraceStep } from "@/lib/types";

const NODE_COLOR: Record<string, string> = {
  retrieve: "bg-purple-100 text-purple-800",
  analyze: "bg-blue-100 text-blue-800",
  generate_sql: "bg-orange-100 text-orange-800",
  execute_sql: "bg-orange-100 text-orange-800",
  verify: "bg-teal-100 text-teal-800",
  answer: "bg-green-100 text-green-800",
  refuse: "bg-gray-100 text-gray-700",
  no_data: "bg-gray-100 text-gray-700",
};

interface Props {
  trace: TraceStep[];
  attempts: { sql: string; error: string | null; stage: string }[];
}

export default function TraceTimeline({ trace, attempts }: Props) {
  const [open, setOpen] = useState(false);
  if (!trace.length) return null;

  const totalMs = trace.reduce((s, t) => s + t.ms, 0);
  const sqlAttempts = attempts.length;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Trace pipeline
          {sqlAttempts > 1 && (
            <span className="ml-2 text-xs font-normal text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
              {sqlAttempts} lần thử SQL
            </span>
          )}
        </span>
        <span className="text-xs text-gray-500">
          {(totalMs / 1000).toFixed(1)}s {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            {trace.map((step, i) => {
              const isSqlRetry =
                step.node === "generate_sql" && (step.attempt as number) > 1;
              return (
                <div key={i} className="flex items-center gap-1">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      NODE_COLOR[step.node] ?? "bg-gray-100 text-gray-700"
                    } ${isSqlRetry ? "ring-2 ring-orange-400" : ""}`}
                    title={JSON.stringify(step, null, 2)}
                  >
                    {step.node}
                    {step.node === "generate_sql" && ` #${step.attempt}`}
                  </span>
                  <span className="text-xs text-gray-400">{step.ms}ms</span>
                  {i < trace.length - 1 && (
                    <span className="text-gray-300">→</span>
                  )}
                </div>
              );
            })}
          </div>

          {attempts.length > 0 && (
            <div className="mt-3 space-y-2">
              {attempts.map((att, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    SQL attempt {i + 1}
                    {att.error && (
                      <span className="ml-2 text-red-600">
                        → {att.stage}: {att.error.slice(0, 100)}
                        {att.error.length > 100 ? "…" : ""}
                      </span>
                    )}
                    {!att.error && (
                      <span className="ml-2 text-green-600">→ OK</span>
                    )}
                  </p>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all font-mono">
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
