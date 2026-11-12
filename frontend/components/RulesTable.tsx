"use client";
import type { Fact } from "@/lib/types";

function fmt(v: number, unit: string) {
  if (unit === "%")   return `${v.toFixed(2)}%`;
  if (unit === "VND") return v >= 1e9 ? `${(v/1e9).toFixed(2)} tỷ` : v >= 1e6 ? `${(v/1e6).toFixed(1)} triệu` : v.toLocaleString("vi-VN");
  if (unit === "days") return `${v} ngày`;
  return String(v);
}

export default function RulesTable({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-up">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kết quả kiểm tra</span>
        <span className="text-xs text-slate-400">{facts.length} phép so sánh</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400">Đối tượng</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Chỉ tiêu</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">Giá trị</th>
            <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-400">Yêu cầu</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Điều khoản</th>
            <th className="px-5 py-2.5 text-center text-xs font-medium text-slate-400">Kết quả</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {facts.map((f, i) => (
            <tr key={i} className={f.status === "FAIL" ? "bg-red-50/40" : ""}>
              <td className="px-5 py-3 font-medium text-slate-700 max-w-[140px] truncate" title={f.subject}>{f.subject}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.metric}</td>
              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${f.status === "FAIL" ? "text-red-600" : "text-emerald-600"}`}>{fmt(f.value, f.unit)}</td>
              <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">{f.operator} {fmt(f.threshold, f.unit)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-blue-50 text-blue-600 border border-blue-100">{f.clause_id}</span>
              </td>
              <td className="px-5 py-3 text-center">
                {f.status === "PASS"
                  ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Pass</span>
                  : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">✕ Fail</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
