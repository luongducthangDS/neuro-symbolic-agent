"use client";
import type { Fact } from "@/lib/types";

interface Props {
  facts: Fact[];
}

function fmtValue(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (unit === "VND") {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} triệu`;
    return v.toLocaleString("vi-VN");
  }
  if (unit === "days") return `${v} ngày`;
  if (unit === "count") return `${v}`;
  return `${v}`;
}

export default function RulesTable({ facts }: Props) {
  if (!facts.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Kết quả kiểm tra từng ngưỡng
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Đối tượng</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Chỉ tiêu</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Giá trị</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Yêu cầu</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Điều khoản</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {facts.map((f, i) => (
              <tr
                key={i}
                className={f.status === "FAIL" ? "bg-red-50" : "hover:bg-gray-50"}
              >
                <td className="px-4 py-2.5 text-gray-800 font-medium max-w-[160px] truncate" title={f.subject}>
                  {f.subject}
                </td>
                <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{f.metric}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                  {fmtValue(f.value, f.unit)}
                </td>
                <td className="px-4 py-2.5 text-center text-gray-600 font-mono text-xs">
                  {f.operator} {fmtValue(f.threshold, f.unit)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                    {f.clause_id}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {f.status === "PASS" ? (
                    <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">
                      PASS
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
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
