import React, { useEffect, useRef } from 'react';
import type { Graph } from '../store';
import { CATEGORY_COLORS } from '../types';
import { DEFS } from '../nodes/defs';
import { nodeWidth, estimateHeight, union, type Rect } from './layout';

const W = 200, H = 130;

export function Minimap({ graph, view, viewport, onJump }: { graph: Graph; view: { x: number; y: number; k: number }; viewport: { w: number; h: number }; onJump: (wx: number, wy: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<{ scale: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const vp: Rect = { x: -view.x / view.k, y: -view.y / view.k, w: viewport.w / view.k, h: viewport.h / view.k };
    const rects: Rect[] = [vp];
    for (const n of graph.nodes) rects.push({ x: n.x, y: n.y, w: nodeWidth(n), h: estimateHeight(n, graph.edges) });
    for (const n of graph.notes) rects.push(n);
    for (const g of graph.groups) rects.push(g);
    const b = union(rects)!;
    const pad = 40;
    const scale = Math.min((W - 16) / (b.w + pad * 2), (H - 16) / (b.h + pad * 2));
    const ox = 8 + ((W - 16) - (b.w + pad * 2) * scale) / 2 - (b.x - pad) * scale;
    const oy = 8 + ((H - 16) - (b.h + pad * 2) * scale) / 2 - (b.y - pad) * scale;
    mapRef.current = { scale, ox, oy };
    const R = (r: Rect) => [ox + r.x * scale, oy + r.y * scale, Math.max(2, r.w * scale), Math.max(2, r.h * scale)] as const;

    for (const g of graph.groups) { ctx.fillStyle = g.color + '33'; ctx.fillRect(...R(g)); }
    for (const n of graph.notes) { ctx.fillStyle = n.color; ctx.fillRect(...R(n)); }
    for (const n of graph.nodes) {
      const def = DEFS[n.type];
      ctx.fillStyle = def ? (def.category === 'output' ? '#2a2a2e' : CATEGORY_COLORS[def.category]) : '#ccc';
      ctx.fillRect(...R({ x: n.x, y: n.y, w: nodeWidth(n), h: estimateHeight(n, graph.edges) }));
    }
    ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 1.5;
    const [vx, vy, vw, vh] = R(vp);
    ctx.strokeRect(vx, vy, vw, vh);
  }, [graph, view, viewport]);

  const jump = (e: React.PointerEvent) => {
    const m = mapRef.current;
    if (!m) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    onJump((mx - m.ox) / m.scale, (my - m.oy) / m.scale);
  };
  return <canvas ref={ref} className="minimap" style={{ width: W, height: H }} onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); jump(e); }} onPointerMove={(e) => { if (e.buttons) jump(e); }} />;
}
