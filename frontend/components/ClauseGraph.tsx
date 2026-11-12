"use client";
import { useEffect, useRef } from "react";
import type { GraphData } from "@/lib/types";

const DOC_COLOR: Record<string, string> = {
  QC: "#60a5fa",
  PL: "#a78bfa",
  TS: "#34d399",
};
const DOC_GLOW: Record<string, string> = {
  QC: "rgba(96,165,250,0.4)",
  PL: "rgba(167,139,250,0.4)",
  TS: "rgba(52,211,153,0.4)",
};

interface Props { data: GraphData; }

export default function ClauseGraph({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const nodes = data.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + 140 * Math.cos((2 * Math.PI * i) / data.nodes.length),
      y: H / 2 + 110 * Math.sin((2 * Math.PI * i) / data.nodes.length),
      vx: 0, vy: 0,
    }));
    const idxById = Object.fromEntries(nodes.map((n, i) => [n.id, i]));

    for (let iter = 0; iter < 150; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const f = 2200 / (dist * dist);
          nodes[i].vx += (dx / dist) * f;
          nodes[i].vy += (dy / dist) * f;
          nodes[j].vx -= (dx / dist) * f;
          nodes[j].vy -= (dy / dist) * f;
        }
      }
      for (const e of data.edges) {
        const a = nodes[idxById[e.from]];
        const b = nodes[idxById[e.to]];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const f = (dist - 65) * 0.04;
        a.vx += (dx / dist) * f; a.vy += (dy / dist) * f;
        b.vx -= (dx / dist) * f; b.vy -= (dy / dist) * f;
      }
      for (const n of nodes) {
        n.vx *= 0.82; n.vy *= 0.82;
        n.x = Math.max(28, Math.min(W - 28, n.x + n.vx));
        n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
      }
    }

    ctx.clearRect(0, 0, W, H);

    // Edges
    for (const e of data.edges) {
      const a = nodes[idxById[e.from]], b = nodes[idxById[e.to]];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.kind === "ref" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.12)";
      ctx.lineWidth = e.kind === "ref" ? 1.5 : 1;
      ctx.setLineDash(e.kind === "term" ? [3, 4] : []);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Nodes
    for (const n of nodes) {
      const doc = n.id.split("-")[0];
      const color = DOC_COLOR[doc] ?? "#94a3b8";
      const glow  = DOC_GLOW[doc]  ?? "rgba(148,163,184,0.3)";

      // Glow
      ctx.beginPath();
      ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = glow.replace("0.4", "0.15");
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = "rgba(15,17,23,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      ctx.font = "bold 8px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.id, n.x, n.y + 20);
    }
  }, [data]);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Đồ thị điều khoản</span>
        <div className="flex gap-3">
          {Object.entries(DOC_COLOR).map(([doc, color]) => (
            <span key={doc} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              {doc}
            </span>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={340} height={260} className="w-full" style={{ display: "block" }} />
      <div className="px-5 py-2 border-t border-white/[0.04] flex gap-5 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t border-slate-500/50" /> dẫn chiếu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t border-dashed border-slate-600/50" /> thuật ngữ
        </span>
      </div>
    </div>
  );
}
