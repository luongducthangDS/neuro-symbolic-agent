"use client";
import { useEffect, useRef } from "react";
import type { GraphData } from "@/lib/types";

const DOC_COLOR: Record<string, string> = { QC: "#3b82f6", PL: "#8b5cf6", TS: "#10b981" };

export default function ClauseGraph({ data }: { data: GraphData }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    const nodes = data.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + 140 * Math.cos(2 * Math.PI * i / data.nodes.length),
      y: H / 2 + 110 * Math.sin(2 * Math.PI * i / data.nodes.length),
      vx: 0, vy: 0,
    }));
    const idx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));

    for (let it = 0; it < 150; it++) {
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx*dx+dy*dy)||0.1, f = 2200/(d*d);
          nodes[i].vx+=dx/d*f; nodes[i].vy+=dy/d*f;
          nodes[j].vx-=dx/d*f; nodes[j].vy-=dy/d*f;
        }
      for (const e of data.edges) {
        const a = nodes[idx[e.from]], b = nodes[idx[e.to]]; if (!a||!b) continue;
        const dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)||0.1, f=(d-65)*0.04;
        a.vx+=dx/d*f; a.vy+=dy/d*f; b.vx-=dx/d*f; b.vy-=dy/d*f;
      }
      for (const n of nodes) {
        n.vx*=0.82; n.vy*=0.82;
        n.x=Math.max(28,Math.min(W-28,n.x+n.vx));
        n.y=Math.max(20,Math.min(H-20,n.y+n.vy));
      }
    }

    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

    for (const e of data.edges) {
      const a=nodes[idx[e.from]], b=nodes[idx[e.to]]; if (!a||!b) continue;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      ctx.strokeStyle = e.kind==="ref" ? "#cbd5e1" : "#e2e8f0";
      ctx.lineWidth = e.kind==="ref" ? 1.5 : 1;
      ctx.setLineDash(e.kind==="term" ? [3,4] : []);
      ctx.stroke(); ctx.setLineDash([]);
    }

    for (const n of nodes) {
      const color = DOC_COLOR[n.id.split("-")[0]] ?? "#64748b";
      ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, Math.PI*2);
      ctx.fillStyle = color+"22"; ctx.fill();
      ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle="#475569"; ctx.font="bold 7.5px 'Inter',sans-serif";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(n.id, n.x, n.y+18);
    }
  }, [data]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đồ thị điều khoản</span>
        <div className="flex gap-3">
          {Object.entries(DOC_COLOR).map(([k,v]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{background:v}}/>{k}
            </span>
          ))}
        </div>
      </div>
      <canvas ref={ref} width={340} height={250} className="w-full block"/>
      <div className="px-5 py-2 border-t border-slate-50 flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-5 border-t border-slate-300 inline-block"/>dẫn chiếu</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-slate-300 inline-block"/>thuật ngữ</span>
      </div>
    </div>
  );
}
