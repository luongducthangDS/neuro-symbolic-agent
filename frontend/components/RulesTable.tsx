"use client";
import type { Fact } from "@/lib/types";

interface Props { facts: Fact[]; }

function fmtValue(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (unit === "VND") {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} triệu`;
    return v.toLocaleString("vi-VN");
  }
  if (unit === "days") return `${v} ngày`;
  return `${v}`;
}

export default function RulesTable({ facts }: Props) {
  if (!facts.length) return null;
  return (
    <div className="animate-fade-up glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Kiểm tra từng ngưỡng điều khoản
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.05]">
              {["Đối tượng","Chỉ tiêu","Giá trị","Yêu cầu","Điều khoản","Kết quả"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider first:pl-5 last:pr-5 last:text-center">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facts.map((f, i) => (
              <tr key={i}
                className={`border-b border-white/[0.03] transition-colors ${
                  f.status === "FAIL" ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="px-4 py-3 pl-5 font-medium text-slate-200 max-w-[150px] truncate" title={f.subject}>
                  {f.subject}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{f.metric}</td>
                <td className={`px-4 py-3 font-bold tabular-nums ${f.status === "FAIL" ? "text-red-400" : "text-emerald-400"}`}>
                  {fmtValue(f.value, f.unit)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {f.operator} {fmtValue(f.threshold, f.unit)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-md font-mono border border-blue-500/20">
                    {f.clause_id}
                  </span>
                </td>
                <td className="px-4 py-3 pr-5 text-center">
                  {f.status === "PASS" ? (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      PASS
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                      FAIL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
