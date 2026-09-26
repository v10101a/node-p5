import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../store';
import type { Graph } from '../store';
import { useRemotes } from '../hooks';
import type { EdgeEnd, PortType, EdgeData, PatchJSON } from '../types';
import { canConnect } from '../types';
import { NodeView, type WireHint } from './NodeView';
import { Wires, type WireGeom } from './Wires';
import { NoteView } from './NoteView';
import { GroupView } from './GroupView';
import { Cursors } from './Cursors';
import { portPos, sizes, nodeWidth, estimateHeight, intersects, contains, union, type Rect } from './layout';
import { connectedInputs, findOutput, findInput, getPortDefs } from '../nodes/ports';

export interface View { x: number; y: number; k: number }
type P = { x: number; y: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'marquee'; start: P; cur: P; base: Set<string> }
  | { kind: 'items'; start: P; ids: string[]; init: Record<string, P>; moved: boolean; clickedId: string; shift: boolean }
  | { kind: 'wire'; edgeId?: string; fixedEnd?: EdgeEnd; fixedPos?: P; fixedSide: 'from' | 'to'; pos: P; type: PortType | null; start: P; moved: boolean }
  | { kind: 'resize'; id: string; what: 'note' | 'group'; start: P; init: { w: number; h: number } };

interface Props {
  graph: Graph;
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  openPalette: (screen: P, world: P) => void;
  closePalette: () => void;
  paletteOpen: boolean;
  mouseWorld: React.MutableRefObject<P>;
}

export function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

export function Canvas({ graph, view, setView, selection, setSelection, openPalette, closePalette, paletteOpen, mouseWorld }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const [local, setLocal] = useState<Record<string, P>>({});
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [liveWire, setLiveWire] = useState<{ a: P; b: P; type: PortType | null } | null>(null);
  const [wireHint, setWireHint] = useState<WireHint | null>(null);
  const [hiddenEdge, setHiddenEdge] = useState<string | null>(null);
  const [resizing, setResizing] = useState<Record<string, { w: number; h: number }>>({});
  const [panning, setPanning] = useState(false);
  const remotes = useRemotes();
  const lastAware = useRef(0);
  const lastDown = useRef<{ t: number; x: number; y: number } | null>(null);
  const fitted = useRef(false);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const selRef = useRef(selection);
  selRef.current = selection;

  // ---------- coordinate helpers ----------
  const toWorld = useCallback((cx: number, cy: number): P => {
    const r = rootRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const positions = useMemo(() => {
    const m: Record<string, P> = {};
    for (const r of remotes) if (r.drag) Object.assign(m, r.drag);
    Object.assign(m, local);
    return m;
  }, [remotes, local]);

  const itemRect = useCallback((id: string, g: Graph = graphRef.current, pos: Record<string, P> = positions): Rect | null => {
    const n = g.byId.get(id);
    const p = pos[id];
    if (n) return { x: p?.x ?? n.x, y: p?.y ?? n.y, w: sizes.get(id)?.w ?? nodeWidth(n), h: estimateHeight(n, g.edges) };
    const note = g.notes.find((x) => x.id === id);
    if (note) return { x: p?.x ?? note.x, y: p?.y ?? note.y, w: note.w, h: note.h };
    const gr = g.groups.find((x) => x.id === id);
    if (gr) return { x: p?.x ?? gr.x, y: p?.y ?? gr.y, w: gr.w, h: gr.h };
    return null;
  }, [positions]);

  const allItemIds = useCallback((g: Graph = graphRef.current) => [...g.nodes.map((n) => n.id), ...g.notes.map((n) => n.id), ...g.groups.map((n) => n.id)], []);

  const fitTo = useCallback((ids: string[]) => {
    const rects = ids.map((id) => itemRect(id)).filter(Boolean) as Rect[];
    const b = union(rects);
    const root = rootRef.current;
    if (!b || !root) return;
    const pad = 60, top = 70, right = Math.min(480, root.clientWidth * 0.35); // keep clear of the toolbar and the preview panel
    const availW = root.clientWidth - pad * 2 - right, availH = root.clientHeight - pad - top;
    const k = Math.min(1.25, availW / b.w, availH / b.h);
    setView({ k, x: pad + (availW - b.w * k) / 2 - b.x * k, y: top + (availH - b.h * k) / 2 - b.y * k });
  }, [itemRect, setView]);

  useEffect(() => {
    if (!fitted.current && graph.nodes.length > 0) {
      fitted.current = true;
      // wait a frame so nodes have been measured
      requestAnimationFrame(() => fitTo(allItemIds(graph)));
    }
  }, [graph, fitTo, allItemIds]);

  // ---------- awareness: selection ----------
  useEffect(() => { S.setAwareSelection([...selection]); }, [selection]);

  // ---------- wheel: pan / zoom ----------
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('.codefield, .note-text')) return;
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const factor = Math.exp(-e.deltaY * 0.01);
        const k = Math.min(3, Math.max(0.15, v.k * factor));
        const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
        setView({ k, x: sx - wx * k, y: sy - wy * k });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  // ---------- selection helpers ----------
  const select = useCallback((ids: Iterable<string>) => setSelection(new Set(ids)), [setSelection]);

  const groupContents = useCallback((gid: string): string[] => {
    const r = itemRect(gid);
    if (!r) return [];
    const g = graphRef.current;
    const out: string[] = [];
    for (const id of [...g.nodes.map((n) => n.id), ...g.notes.map((n) => n.id)]) {
      const ir = itemRect(id);
      if (ir && contains(r, { x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 })) out.push(id);
    }
    return out;
  }, [itemRect]);

  // ---------- pointer ----------
  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-widget]') || isTyping(t) || t.closest('button')) return;
    if (paletteOpen) closePalette();
    const root = rootRef.current!;
    const w = toWorld(e.clientX, e.clientY);
    const g = graphRef.current;

    // pan: middle button, space held
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      root.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const portEl = t.closest('[data-port]') as HTMLElement | null;
    if (portEl) {
      const side = portEl.dataset.port as 'in' | 'out';
      const end: EdgeEnd = { node: portEl.dataset.node!, port: portEl.dataset.name! };
      const node = g.byId.get(end.node)!;
      if (side === 'out') {
        const type = findOutput(node, end.port)?.type ?? null;
        dragRef.current = { kind: 'wire', fixedEnd: end, fixedSide: 'from', pos: w, type, start: w, moved: false };
        setWireHint(type ? { type, side: 'from' } : null);
      } else {
        const existing = g.edges.find((ed) => ed.to?.node === end.node && ed.to.port === end.port);
        if (existing && existing.from) {
          // detach: drag the input end of the existing wire
          const src = g.byId.get(existing.from.node)!;
          const type = findOutput(src, existing.from.port)?.type ?? null;
          dragRef.current = { kind: 'wire', edgeId: existing.id, fixedEnd: existing.from, fixedSide: 'from', pos: w, type, start: w, moved: false };
          setHiddenEdge(existing.id);
          setWireHint(type ? { type, side: 'from' } : null);
        } else if (existing) {
          // loose-from edge attached to this input: drag its loose end
          dragRef.current = { kind: 'wire', edgeId: existing.id, fixedEnd: end, fixedSide: 'to', pos: existing.fromPos ?? w, type: findInput(node, end.port, connectedInputs(node.id, g.edges))?.type ?? null, start: w, moved: false };
          setHiddenEdge(existing.id);
        } else {
          const type = findInput(node, end.port, connectedInputs(node.id, g.edges))?.type ?? null;
          dragRef.current = { kind: 'wire', fixedEnd: end, fixedSide: 'to', pos: w, type, start: w, moved: false };
          setWireHint(type ? { type, side: 'to' } : null);
        }
      }
      root.setPointerCapture(e.pointerId);
      return;
    }

    const looseEl = t.closest('[data-loose]') as HTMLElement | null;
    if (looseEl) {
      const edge = g.edges.find((ed) => ed.id === looseEl.dataset.edge);
      if (edge) {
        const looseSide = looseEl.dataset.loose as 'from' | 'to';
        const fixedSide = looseSide === 'from' ? 'to' : 'from';
        const fixedEnd = fixedSide === 'from' ? edge.from : edge.to;
        const fixedPos = fixedSide === 'from' ? edge.fromPos : edge.toPos;
        let type: PortType | null = null;
        if (fixedEnd) {
          const n = g.byId.get(fixedEnd.node);
          if (n) type = fixedSide === 'from' ? findOutput(n, fixedEnd.port)?.type ?? null : findInput(n, fixedEnd.port, connectedInputs(n.id, g.edges))?.type ?? null;
        }
        dragRef.current = { kind: 'wire', edgeId: edge.id, fixedEnd, fixedPos, fixedSide, pos: w, type, start: w, moved: false };
        setHiddenEdge(edge.id);
        setWireHint(type ? { type, side: fixedSide } : null);
        root.setPointerCapture(e.pointerId);
      }
      return;
    }

    const resizeEl = t.closest('[data-resize]') as HTMLElement | null;
    if (resizeEl) {
      const id = resizeEl.dataset.resize!;
      const note = g.notes.find((n) => n.id === id);
      const gr = g.groups.find((n) => n.id === id);
      const item = note ?? gr;
      if (item) {
        dragRef.current = { kind: 'resize', id, what: note ? 'note' : 'group', start: w, init: { w: item.w, h: item.h } };
        root.setPointerCapture(e.pointerId);
      }
      return;
    }

    const edgeEl = t.closest('[data-edge]') as HTMLElement | null;
    if (edgeEl) {
      const id = edgeEl.dataset.edge!;
      if (e.shiftKey) { const s = new Set(selection); s.has(id) ? s.delete(id) : s.add(id); setSelection(s); }
      else select([id]);
      return;
    }

    const itemEl = (t.closest('[data-node]') ?? t.closest('[data-note]') ?? t.closest('[data-group-header]')) as HTMLElement | null;
    if (itemEl) {
      const id = itemEl.dataset.node ?? itemEl.dataset.note ?? itemEl.dataset.groupHeader!;
      let sel = new Set(selection);
      if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); }
      else if (!sel.has(id)) sel = new Set([id]);
      setSelection(sel);
      if (!sel.has(id)) return;
      // items to move: selection + contents of selected groups
      const ids = new Set<string>();
      for (const sid of sel) {
        if (g.edges.some((ed) => ed.id === sid)) continue;
        ids.add(sid);
        if (g.groups.some((gr) => gr.id === sid)) for (const c of groupContents(sid)) ids.add(c);
      }
      const init: Record<string, P> = {};
      for (const iid of ids) { const r = itemRect(iid); if (r) init[iid] = { x: r.x, y: r.y }; }
      dragRef.current = { kind: 'items', start: w, ids: [...ids], init, moved: false, clickedId: id, shift: e.shiftKey };
      root.setPointerCapture(e.pointerId);
      return;
    }

    // background: double-click opens the palette (pointer capture eats native dblclick)
    const prev = lastDown.current;
    lastDown.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (prev && performance.now() - prev.t < 400 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6) {
      lastDown.current = null;
      e.preventDefault(); // keep focus from jumping to the canvas after the palette mounts
      openPalette({ x: e.clientX, y: e.clientY }, w);
      return;
    }
    if (e.shiftKey) {
      // background + shift: marquee select
      dragRef.current = { kind: 'marquee', start: w, cur: w, base: new Set(selection) };
    } else {
      // background: pan the canvas
      select([]);
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      setPanning(true);
    }
    root.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    mouseWorld.current = w;
    const now = performance.now();
    if (now - lastAware.current > 40) { lastAware.current = now; S.setCursor(w); }
    const d = dragRef.current;
    if (!d) return;
    switch (d.kind) {
      case 'pan':
        setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
        break;
      case 'marquee': {
        d.cur = w;
        const r: Rect = { x: Math.min(d.start.x, w.x), y: Math.min(d.start.y, w.y), w: Math.abs(w.x - d.start.x), h: Math.abs(w.y - d.start.y) };
        setMarquee(r);
        const sel = new Set(d.base);
        const g = graphRef.current;
        for (const n of [...g.nodes, ...g.notes]) { const ir = itemRect(n.id); if (ir && intersects(r, ir)) sel.add(n.id); }
        for (const gr of g.groups) { const ir = itemRect(gr.id); if (ir && ir.x >= r.x && ir.y >= r.y && ir.x + ir.w <= r.x + r.w && ir.y + ir.h <= r.y + r.h) sel.add(gr.id); }
        setSelection(sel);
        break;
      }
      case 'items': {
        const dx = w.x - d.start.x, dy = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * viewRef.current.k < 3) return;
        d.moved = true;
        const pos: Record<string, P> = {};
        for (const id of d.ids) pos[id] = { x: d.init[id].x + dx, y: d.init[id].y + dy };
        setLocal(pos);
        if (now - lastAware.current > 30) S.setAwareDrag(pos);
        break;
      }
      case 'wire': {
        if (Math.hypot(w.x - d.start.x, w.y - d.start.y) * viewRef.current.k > 3) d.moved = true;
        d.pos = w;
        const fixed = fixedPoint(d);
        if (fixed) setLiveWire(d.fixedSide === 'from' ? { a: fixed, b: w, type: d.type } : { a: w, b: fixed, type: d.type });
        break;
      }
      case 'resize': {
        const nw = Math.max(80, d.init.w + (w.x - d.start.x)), nh = Math.max(40, d.init.h + (w.y - d.start.y));
        setResizing({ [d.id]: { w: nw, h: nh } });
        break;
      }
    }
  };

  const fixedPoint = (d: Extract<Drag, { kind: 'wire' }>): P | null => {
    if (d.fixedEnd) {
      const n = graphRef.current.byId.get(d.fixedEnd.node);
      if (!n) return null;
      const p = positions[n.id];
      return portPos(n, d.fixedSide === 'from' ? 'out' : 'in', d.fixedEnd.port, graphRef.current.edges, p);
    }
    return d.fixedPos ?? null;
  };

  const finishWire = (d: Extract<Drag, { kind: 'wire' }>, cx: number, cy: number) => {
    const g = graphRef.current;
    const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const portEl = el?.closest('[data-port]') as HTMLElement | null;
    const nodeEl = el?.closest('[data-node]') as HTMLElement | null;
    const wantSide = d.fixedSide === 'from' ? 'in' : 'out';
    let target: EdgeEnd | null = null;
    if (portEl && portEl.dataset.port === wantSide) target = { node: portEl.dataset.node!, port: portEl.dataset.name! };
    else if (nodeEl && d.type) {
      const nid = nodeEl.dataset.node!;
      if (d.fixedSide === 'from') { const p = S.firstCompatibleInput(nid, d.type); if (p) target = { node: nid, port: p }; }
      else {
        const n = g.byId.get(nid);
        const o = n && getPortDefs(n).outputs.find((o) => canConnect(o.type, d.type!));
        if (o) target = { node: nid, port: o.name };
      }
    }
    if (target && d.fixedEnd) {
      const from = d.fixedSide === 'from' ? d.fixedEnd : target;
      const to = d.fixedSide === 'from' ? target : d.fixedEnd;
      if (from.node !== to.node && S.connect(from, to, d.edgeId)) return;
    } else if (target && d.edgeId) {
      const e: EdgeData = { id: d.edgeId };
      if (d.fixedSide === 'from') { e.fromPos = d.fixedPos; e.to = target; } else { e.toPos = d.fixedPos; e.from = target; }
      // an input can only have one wire
      if (e.to) for (const ed of g.edges) if (ed.id !== e.id && ed.to?.node === e.to.node && ed.to.port === e.to.port) S.removeEdge(ed.id);
      S.setEdge(e);
      return;
    }
    // leave it dangling
    if (!d.moved && !d.edgeId) return;
    const pos = d.pos;
    const e: EdgeData = { id: d.edgeId ?? S.uid() };
    if (d.fixedSide === 'from') { if (d.fixedEnd) e.from = d.fixedEnd; else e.fromPos = d.fixedPos; e.toPos = { x: Math.round(pos.x), y: Math.round(pos.y) }; }
    else { if (d.fixedEnd) e.to = d.fixedEnd; else e.toPos = d.fixedPos; e.fromPos = { x: Math.round(pos.x), y: Math.round(pos.y) }; }
    S.setEdge(e);
  };

  const endDrag = (e?: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    setMarquee(null);
    setLiveWire(null);
    setWireHint(null);
    setHiddenEdge(null);
    if (!d) return;
    if (d.kind === 'items') {
      if (d.moved) {
        const pos: Record<string, P> = {};
        for (const id of d.ids) pos[id] = local[id] ?? d.init[id];
        S.moveItems(pos);
        S.setAwareDrag(null);
      } else if (!d.shift && selRef.current.size > 1) select([d.clickedId]);
      setLocal({});
    } else if (d.kind === 'wire' && e) {
      finishWire(d, e.clientX, e.clientY);
    } else if (d.kind === 'resize') {
      const r = resizing[d.id];
      if (r) (d.what === 'note' ? S.updateNote : S.updateGroup)(d.id, { w: Math.round(r.w), h: Math.round(r.h) });
      setResizing({});
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    endDrag(e);
    try { rootRef.current?.releasePointerCapture(e.pointerId); } catch {}
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (isTyping(t)) return;
    e.preventDefault();
    openPalette({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
  };

  // ---------- keyboard & clipboard ----------
  const duplicate = useCallback((ids: Set<string>, offset = { x: 40, y: 40 }) => {
    const patch = S.exportPatch(ids);
    const created = S.importPatch(patch, offset);
    select(created);
  }, [select]);

  const groupSelection = useCallback(() => {
    const sel = [...selRef.current].filter((id) => !graphRef.current.edges.some((e) => e.id === id) && !graphRef.current.groups.some((g) => g.id === id));
    let rect: Rect | null = union(sel.map((id) => itemRect(id)).filter(Boolean) as Rect[]);
    const m = mouseWorld.current;
    if (!rect) rect = { x: m.x - 160, y: m.y - 100, w: 320, h: 220 };
    const pad = 24;
    const id = S.addGroup({ x: rect.x - pad, y: rect.y - pad - 26, w: rect.w + pad * 2, h: rect.h + pad * 2 + 26 });
    select([id]);
  }, [itemRect, select, mouseWorld]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = selRef.current;
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return; }
      if (e.key === 'Escape') {
        if (dragRef.current) { endDrag(); return; }
        if (paletteOpen) closePalette(); else select([]);
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) { e.preventDefault(); S.removeItems(sel); select([]); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.undoManager.redo() : S.undoManager.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); S.undoManager.redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); select(allItemIds()); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (sel.size) duplicate(sel); return; }
      if (mod) return;
      const m = mouseWorld.current;
      if (e.key === 'Tab') {
        e.preventDefault();
        const r = rootRef.current!.getBoundingClientRect();
        const v = viewRef.current;
        openPalette({ x: r.left + m.x * v.k + v.x, y: r.top + m.y * v.k + v.y }, m);
        return;
      }
      if (e.key === 'n') { e.preventDefault(); const id = S.addNote(m.x - 100, m.y - 20); select([id]); return; }
      if (e.key === 'g') { e.preventDefault(); groupSelection(); return; }
      if (e.key === 'f') { e.preventDefault(); fitTo(sel.size ? [...sel] : allItemIds()); return; }
      if (e.key === '0') { e.preventDefault(); setView((v) => ({ ...v, k: 1 })); return; }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceRef.current = false; };
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement) || !selRef.current.size) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', JSON.stringify(S.exportPatch(selRef.current), null, 1));
    };
    const onCut = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement) || !selRef.current.size) return;
      onCopy(e);
      S.removeItems(selRef.current);
      select([]);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      e.preventDefault();
      const m = mouseWorld.current;
      try {
        const p = JSON.parse(text) as PatchJSON;
        if (p && p.version === 1 && Array.isArray(p.nodes)) {
          const rects: Rect[] = [...p.nodes.map((n) => ({ x: n.x, y: n.y, w: 190, h: 100 })), ...(p.notes ?? []), ...(p.groups ?? [])];
          const b = union(rects);
          const off = b ? { x: Math.round(m.x - b.x), y: Math.round(m.y - b.y) } : { x: 0, y: 0 };
          select(S.importPatch(p, off));
          return;
        }
      } catch {}
      const id = S.addNote(m.x, m.y, text.slice(0, 2000));
      select([id]);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [paletteOpen, closePalette, openPalette, select, allItemIds, duplicate, groupSelection, fitTo, setView, mouseWorld]);

  // ---------- derived render data ----------
  const remoteSel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of remotes) for (const id of r.selection ?? []) if (!m.has(id)) m.set(id, r.user.color);
    return m;
  }, [remotes]);

  const connectedByNode = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, [...connectedInputs(n.id, graph.edges)].sort().join(','));
    return m;
  }, [graph]);

  const wires = useMemo<WireGeom[]>(() => {
    const out: WireGeom[] = [];
    for (const e of graph.edges) {
      if (e.id === hiddenEdge) continue;
      let a: P | null = null, b: P | null = null, type: PortType | null = null;
      if (e.from) {
        const n = graph.byId.get(e.from.node);
        if (!n) continue;
        a = portPos(n, 'out', e.from.port, graph.edges, positions[n.id]);
        type = findOutput(n, e.from.port)?.type ?? null;
      } else a = e.fromPos ?? null;
      if (e.to) {
        const n = graph.byId.get(e.to.node);
        if (!n) continue;
        b = portPos(n, 'in', e.to.port, graph.edges, positions[n.id]);
        if (!type) type = findInput(n, e.to.port, connectedInputs(n.id, graph.edges))?.type ?? null;
      } else b = e.toPos ?? null;
      if (!a || !b) continue;
      out.push({ id: e.id, a, b, type, looseA: !e.from, looseB: !e.to });
    }
    return out;
  }, [graph, positions, hiddenEdge]);

  const posOf = (item: { id: string; x: number; y: number }) => positions[item.id] ?? item;

  return (
    <div ref={rootRef} className={'canvas' + (wireHint ? ' wiring' : '') + (panning ? ' panning' : '')} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu} onPointerLeave={() => S.setCursor(null)}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px` }}>
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {graph.groups.map((g) => {
          const p = posOf(g), r = resizing[g.id];
          return <GroupView key={g.id} group={r ? { ...g, ...r } : g} x={p.x} y={p.y} selected={selection.has(g.id)} />;
        })}
        <Wires wires={wires} selected={selection} live={liveWire} />
        {graph.notes.map((n) => {
          const p = posOf(n), r = resizing[n.id];
          return <NoteView key={n.id} note={r ? { ...n, ...r } : n} x={p.x} y={p.y} selected={selection.has(n.id)} remoteColor={remoteSel.get(n.id)} />;
        })}
        {graph.nodes.map((n) => {
          const p = posOf(n);
          return <NodeView key={n.id} node={n} connected={connectedByNode.get(n.id) ?? ''} x={p.x} y={p.y} selected={selection.has(n.id)} remoteColor={remoteSel.get(n.id)} wire={wireHint} />;
        })}
        <Cursors remotes={remotes} k={view.k} />
        {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
      </div>
    </div>
  );
}
