"use client";
import type { Verdict } from "@/lib/types";

const CONFIG: Record<
  Verdict,
  { label: string; icon: string; bg: string; text: string; border: string }
> = {
  PASS: {
    label: "TUÂN THỦ",
    icon: "✅",
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-300",
  },
  FAIL: {
    label: "VI PHẠM",
    icon: "❌",
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-300",
  },
  UNVERIFIED: {
    label: "CHƯA KIỂM CHỨNG",
    icon: "⚠️",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
  },
  NO_RULE: {
    label: "KHÔNG CÓ NGƯỠNG",
    icon: "ℹ️",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-300",
  },
  REFUSE: {
    label: "TỪ CHỐI",
    icon: "🚫",
    bg: "bg-gray-50",
    text: "text-gray-800",
    border: "border-gray-300",
  },
};

interface Props {
  verdict: Verdict;
  failCount?: number;
  totalCount?: number;
}

export default function VerdictBanner({ verdict, failCount, totalCount }: Props) {
  const c = CONFIG[verdict] ?? CONFIG.UNVERIFIED;
  return (
    <div
      className={`rounded-xl border-2 ${c.border} ${c.bg} px-6 py-4 flex items-center gap-4`}
    >
      <span className="text-3xl">{c.icon}</span>
      <div>
        <p className={`text-2xl font-bold tracking-wide ${c.text}`}>{c.label}</p>
        {verdict === "FAIL" && failCount !== undefined && totalCount !== undefined && (
          <p className={`text-sm mt-0.5 ${c.text} opacity-80`}>
            {failCount} / {totalCount} phép so sánh vượt ngưỡng
          </p>
        )}
      </div>
    </div>
  );
}
