import type { NodeData, EdgeData, PortDef } from '../types';
import { DEFS } from '../nodes/defs';
import { expandInputs, getPortDefs, connectedInputs } from '../nodes/ports';

export const NODE_W = 190;
export const HEAD_H = 30;
export const ROW_H = 24;
export const BODY_PAD = 6;

/** measured element sizes (nodes, notes, groups) */
export const sizes = new Map<string, { w: number; h: number }>();

export function nodeWidth(node: NodeData): number {
  const w = DEFS[node.type]?.width ?? NODE_W;
  const hasExpr = Object.values(node.params ?? {}).some((v) => typeof v === 'string' && v.length > 3 && !DEFS[node.type]?.params?.some((p) => p.widget === 'select' || p.widget === 'text' || p.widget === 'code'));
  return hasExpr ? Math.max(w, 250) : w;
}

export function nodeRows(node: NodeData, edges: EdgeData[]): { inputs: PortDef[]; outputs: PortDef[] } {
  const conn = connectedInputs(node.id, edges);
  return { inputs: expandInputs(node, conn), outputs: getPortDefs(node).outputs };
}

export function estimateHeight(node: NodeData, edges: EdgeData[]): number {
  const m = sizes.get(node.id);
  if (m) return m.h;
  const { inputs, outputs } = nodeRows(node, edges);
  const def = DEFS[node.type];
  let h = HEAD_H + BODY_PAD * 2 + (inputs.length + outputs.length) * ROW_H;
  for (const p of def?.params ?? []) h += p.widget === 'code' ? 130 : p.widget === 'ports' ? 60 : 28;
  return h;
}

export function portPos(node: NodeData, side: 'in' | 'out', port: string, edges: EdgeData[], pos?: { x: number; y: number }): { x: number; y: number } | null {
  const { inputs, outputs } = nodeRows(node, edges);
  const x0 = pos?.x ?? node.x, y0 = pos?.y ?? node.y;
  if (side === 'out') {
    const i = outputs.findIndex((p) => p.name === port);
    if (i < 0) return null;
    return { x: x0 + nodeWidth(node), y: y0 + HEAD_H + BODY_PAD + i * ROW_H + ROW_H / 2 };
  }
  const j = inputs.findIndex((p) => p.name === port);
  if (j < 0) return null;
  return { x: x0, y: y0 + HEAD_H + BODY_PAD + (outputs.length + j) * ROW_H + ROW_H / 2 };
}

export interface Rect { x: number; y: number; w: number; h: number; }
export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function contains(outer: Rect, p: { x: number; y: number }) {
  return p.x >= outer.x && p.x <= outer.x + outer.w && p.y >= outer.y && p.y <= outer.y + outer.h;
}
export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
