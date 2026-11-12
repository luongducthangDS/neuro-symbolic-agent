"use client";
import type { Verdict } from "@/lib/types";

const CONFIG: Record<Verdict, {
  label: string; icon: string;
  gradient: string; border: string; glow: string; text: string;
}> = {
  PASS: {
    label: "TUÂN THỦ", icon: "✓",
    gradient: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/40", glow: "glow-green", text: "text-emerald-400",
  },
  FAIL: {
    label: "VI PHẠM", icon: "✕",
    gradient: "from-red-500/20 to-rose-500/10",
    border: "border-red-500/40", glow: "glow-red", text: "text-red-400",
  },
  UNVERIFIED: {
    label: "CHƯA KIỂM CHỨNG", icon: "⚠",
    gradient: "from-amber-500/20 to-yellow-500/10",
    border: "border-amber-500/40", glow: "", text: "text-amber-400",
  },
  NO_RULE: {
    label: "KHÔNG CÓ NGƯỠNG", icon: "ℹ",
    gradient: "from-blue-500/20 to-indigo-500/10",
    border: "border-blue-500/30", glow: "", text: "text-blue-400",
  },
  REFUSE: {
    label: "TỪ CHỐI (READ-ONLY)", icon: "⊘",
    gradient: "from-slate-500/20 to-slate-600/10",
    border: "border-slate-500/30", glow: "", text: "text-slate-400",
  },
};

interface Props { verdict: Verdict; failCount?: number; totalCount?: number; }

export default function VerdictBanner({ verdict, failCount, totalCount }: Props) {
  const c = CONFIG[verdict] ?? CONFIG.UNVERIFIED;
  return (
    <div className={`animate-slide-in relative overflow-hidden rounded-2xl bg-gradient-to-r ${c.gradient} border ${c.border} ${c.glow} p-5`}>
      {/* Decorative circle */}
      <div className={`absolute -right-6 -top-6 w-28 h-28 rounded-full bg-gradient-to-br ${c.gradient} opacity-30`} />
      <div className="relative flex items-center gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold ${c.text} bg-black/20`}>
          {c.icon}
        </div>
        <div>
          <p className={`text-2xl font-bold tracking-widest ${c.text}`}>{c.label}</p>
          {verdict === "FAIL" && failCount !== undefined && totalCount !== undefined && (
            <p className="text-sm text-slate-400 mt-0.5">
              <span className={`font-semibold ${c.text}`}>{failCount}</span>
              <span> / {totalCount} phép so sánh vượt ngưỡng</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
