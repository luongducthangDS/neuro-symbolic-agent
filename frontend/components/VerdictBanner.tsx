"use client";
import type { Verdict } from "@/lib/types";

const CFG: Record<Verdict, { label: string; icon: string; bg: string; border: string; iconCls: string; labelCls: string; }> = {
  PASS:       { label: "Tuân thủ",          icon: "✓", bg: "bg-emerald-50",  border: "border-emerald-200", iconCls: "text-emerald-600 bg-emerald-100", labelCls: "text-emerald-700" },
  FAIL:       { label: "Vi phạm",           icon: "✕", bg: "bg-red-50",      border: "border-red-200",     iconCls: "text-red-600 bg-red-100",         labelCls: "text-red-700" },
  UNVERIFIED: { label: "Chưa kiểm chứng",   icon: "!", bg: "bg-amber-50",    border: "border-amber-200",   iconCls: "text-amber-600 bg-amber-100",     labelCls: "text-amber-700" },
  NO_RULE:    { label: "Không có ngưỡng",   icon: "i", bg: "bg-blue-50",     border: "border-blue-200",    iconCls: "text-blue-600 bg-blue-100",       labelCls: "text-blue-700" },
  REFUSE:     { label: "Từ chối (read-only)",icon: "⊘", bg: "bg-slate-50",   border: "border-slate-200",   iconCls: "text-slate-500 bg-slate-100",     labelCls: "text-slate-600" },
};

export default function VerdictBanner({ verdict, failCount, totalCount }: { verdict: Verdict; failCount?: number; totalCount?: number }) {
  const c = CFG[verdict] ?? CFG.UNVERIFIED;
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${c.border} ${c.bg} px-4 py-3 animate-up`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${c.iconCls}`}>
        {c.icon}
      </div>
      <div>
        <p className={`font-semibold text-base ${c.labelCls}`}>{c.label}</p>
        {verdict === "FAIL" && failCount !== undefined && (
          <p className="text-xs text-slate-500 mt-0.5">{failCount} / {totalCount} phép so sánh vượt ngưỡng</p>
        )}
      </div>
    </div>
  );
}
