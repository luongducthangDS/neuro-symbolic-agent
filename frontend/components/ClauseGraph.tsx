"use client";
import { useEffect, useRef } from "react";
import type { GraphData } from "@/lib/types";

const DOC_COLOR: Record<string, string> = {
  QC: "#3b82f6",
  PL: "#8b5cf6",
  TS: "#10b981",
};

interface Props {
  data: GraphData;
}

export default function ClauseGraph({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Simple force-directed layout approximation with fixed iterations
    const nodes = data.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + 150 * Math.cos((2 * Math.PI * i) / data.nodes.length),
      y: H / 2 + 120 * Math.sin((2 * Math.PI * i) / data.nodes.length),
      vx: 0,
      vy: 0,
    }));
    const idxById = Object.fromEntries(nodes.map((n, i) => [n.id, i]));

    const K = 60; // spring rest length
    const REPEL = 2000;
    const DAMPING = 0.85;

    for (let iter = 0; iter < 120; iter++) {
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const f = REPEL / (dist * dist);
          nodes[i].vx += (dx / dist) * f;
          nodes[i].vy += (dy / dist) * f;
          nodes[j].vx -= (dx / dist) * f;
          nodes[j].vy -= (dy / dist) * f;
        }
      }
      // attraction
      for (const e of data.edges) {
        const a = nodes[idxById[e.from]];
        const b = nodes[idxById[e.to]];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const f = (dist - K) * 0.05;
        a.vx += (dx / dist) * f;
        a.vy += (dy / dist) * f;
        b.vx -= (dx / dist) * f;
        b.vy -= (dy / dist) * f;
      }
      // integrate + damping + bounds
      for (const n of nodes) {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
        n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
      }
    }

    // draw
    ctx.clearRect(0, 0, W, H);

    // edges
    for (const e of data.edges) {
      const a = nodes[idxById[e.from]];
      const b = nodes[idxById[e.to]];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.kind === "ref" ? "#93c5fd" : "#c4b5fd";
      ctx.lineWidth = e.kind === "ref" ? 1.5 : 1;
      ctx.setLineDash(e.kind === "term" ? [3, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // nodes
    for (const n of nodes) {
      const doc = n.id.split("-")[0];
      const color = DOC_COLOR[doc] ?? "#6b7280";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.id, n.x, n.y + 18);
    }
  }, [data]);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Đồ thị điều khoản</span>
        <div className="flex gap-3 text-xs text-gray-500">
          {Object.entries(DOC_COLOR).map(([doc, color]) => (
            <span key={doc} className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: color }}
              />
              {doc}
            </span>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={340}
        height={260}
        className="w-full"
        style={{ display: "block" }}
      />
      <div className="px-4 py-2 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-blue-300" />
          dẫn chiếu tường minh
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-4 border-t border-dashed border-purple-300"
          />
          thuật ngữ
        </span>
      </div>
    </div>
  );
}
