<script>
  import * as S from '../store.js';
  import { live, ui, mouseWorld } from '../state.svelte.js';
  import { canConnect } from '../types.js';
  import NodeView from './NodeView.svelte';
  import Wires from './Wires.svelte';
  import NoteView from './NoteView.svelte';
  import GroupView from './GroupView.svelte';
  import Cursors from './Cursors.svelte';
  import { portPos, sizes, nodeWidth, estimateHeight, intersects, contains, union } from './layout.js';
  import { connectedInputs, findOutput, findInput, getPortDefs } from '../nodes/ports.js';

  let root = $state(null);
  let drag = null; // the current gesture: pan | marquee | items | wire | resize
  let space = false;
  let lastAware = 0;
  let lastDown = null;
  let fitted = false;

  // ephemeral render state
  let local = $state.raw({}); // positions of items being dragged locally
  let marquee = $state.raw(null);
  let liveWire = $state.raw(null);
  let wireHint = $state.raw(null);
  let hiddenEdge = $state(null);
  let resizing = $state.raw({});
  let panning = $state(false);
  let dragging = $state(false); // an item drag in progress: closed-hand cursor

  const graph = $derived(live.graph);
  const view = $derived(ui.view);
  const selection = $derived(ui.selection);

  export function isTyping(el) {
    const t = el;
    if (!t || !t.tagName) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  }

  // ---------- coordinate helpers ----------
  function toWorld(cx, cy) {
    const r = root.getBoundingClientRect();
    const v = ui.view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }
  const positions = $derived.by(() => {
    const m = {};
    for (const r of live.remotes) if (r.drag) Object.assign(m, r.drag);
    Object.assign(m, local);
    return m;
  });
  function itemRect(id, g = live.graph, pos = positions) {
    const n = g.byId.get(id);
    const p = pos[id];
    if (n) return { x: p?.x ?? n.x, y: p?.y ?? n.y, w: sizes.get(id)?.w ?? nodeWidth(n), h: estimateHeight(n, g.edges) };
    const note = g.notes.find((x) => x.id === id);
    if (note) return { x: p?.x ?? note.x, y: p?.y ?? note.y, w: note.w, h: note.h };
    const gr = g.groups.find((x) => x.id === id);
    if (gr) return { x: p?.x ?? gr.x, y: p?.y ?? gr.y, w: gr.w, h: gr.h };
    return null;
  }
  const allItemIds = (g = live.graph) => [...g.nodes.map((n) => n.id), ...g.notes.map((n) => n.id), ...g.groups.map((n) => n.id)];
  const select = (ids) => { ui.selection = new Set(ids); };

  function fitTo(ids) {
    const b = union(ids.map((id) => itemRect(id)).filter(Boolean));
    if (!b || !root) return;
    const pad = 60, top = 70, right = Math.min(480, root.clientWidth * 0.35); // keep clear of the toolbar and the preview panel
    const availW = root.clientWidth - pad * 2 - right, availH = root.clientHeight - pad - top;
    const k = Math.min(1.25, availW / b.w, availH / b.h);
    ui.view = { k, x: pad + (availW - b.w * k) / 2 - b.x * k, y: top + (availH - b.h * k) / 2 - b.y * k };
  }
  $effect(() => {
    if (!fitted && live.graph.nodes.length > 0) {
      fitted = true;
      requestAnimationFrame(() => fitTo(allItemIds())); // wait a frame so nodes have been measured
    }
  });
  $effect(() => { S.setAwareSelection([...ui.selection]); });

  // ---------- wheel: pan / zoom (needs a non-passive listener) ----------
  $effect(() => {
    if (!root) return;
    const el = root;
    const onWheel = (e) => {
      if (e.target.closest?.('.codefield, .note-text')) return;
      e.preventDefault();
      const v = ui.view;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const k = Math.min(3, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.01)));
        const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
        ui.view = { k, x: sx - wx * k, y: sy - wy * k };
      } else {
        ui.view = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function groupContents(gid) {
    const r = itemRect(gid);
    if (!r) return [];
    const g = live.graph;
    const out = [];
    for (const id of [...g.nodes.map((n) => n.id), ...g.notes.map((n) => n.id)]) {
      const ir = itemRect(id);
      if (ir && contains(r, { x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 })) out.push(id);
    }
    return out;
  }
  const openPalette = (screen, world) => { ui.palette = { screen, world }; };

  // ---------- pointer ----------
  function onPointerDown(e) {
    const t = e.target;
    if (t.closest('[data-widget]') || isTyping(t) || t.closest('button')) return;
    if (ui.palette) ui.palette = null;
    const w = toWorld(e.clientX, e.clientY);
    const g = live.graph;
    const v = ui.view;

    if (e.button === 1 || (e.button === 0 && space)) {
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      root.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const portEl = t.closest('[data-port]');
    if (portEl) {
      const side = portEl.dataset.port;
      const end = { node: portEl.dataset.node, port: portEl.dataset.name };
      const node = g.byId.get(end.node);
      if (side === 'out') {
        const type = findOutput(node, end.port)?.type ?? null;
        drag = { kind: 'wire', fixedEnd: end, fixedSide: 'from', pos: w, type, start: w, moved: false };
        wireHint = type ? { type, side: 'from' } : null;
      } else {
        const existing = g.edges.find((ed) => ed.to?.node === end.node && ed.to.port === end.port);
        if (existing && existing.from) {
          // detach: drag the input end of the existing wire
          const src = g.byId.get(existing.from.node);
          const type = findOutput(src, existing.from.port)?.type ?? null;
          drag = { kind: 'wire', edgeId: existing.id, fixedEnd: existing.from, fixedSide: 'from', pos: w, type, start: w, moved: false };
          hiddenEdge = existing.id;
          wireHint = type ? { type, side: 'from' } : null;
        } else if (existing) {
          drag = { kind: 'wire', edgeId: existing.id, fixedEnd: end, fixedSide: 'to', pos: existing.fromPos ?? w, type: findInput(node, end.port, connectedInputs(node.id, g.edges))?.type ?? null, start: w, moved: false };
          hiddenEdge = existing.id;
        } else {
          const type = findInput(node, end.port, connectedInputs(node.id, g.edges))?.type ?? null;
          drag = { kind: 'wire', fixedEnd: end, fixedSide: 'to', pos: w, type, start: w, moved: false };
          wireHint = type ? { type, side: 'to' } : null;
        }
      }
      root.setPointerCapture(e.pointerId);
      return;
    }

    const looseEl = t.closest('[data-loose]');
    if (looseEl) {
      const edge = g.edges.find((ed) => ed.id === looseEl.dataset.edge);
      if (edge) {
        const looseSide = looseEl.dataset.loose;
        const fixedSide = looseSide === 'from' ? 'to' : 'from';
        const fixedEnd = fixedSide === 'from' ? edge.from : edge.to;
        const fixedPos = fixedSide === 'from' ? edge.fromPos : edge.toPos;
        let type = null;
        if (fixedEnd) {
          const n = g.byId.get(fixedEnd.node);
          if (n) type = fixedSide === 'from' ? findOutput(n, fixedEnd.port)?.type ?? null : findInput(n, fixedEnd.port, connectedInputs(n.id, g.edges))?.type ?? null;
        }
        drag = { kind: 'wire', edgeId: edge.id, fixedEnd, fixedPos, fixedSide, pos: w, type, start: w, moved: false };
        hiddenEdge = edge.id;
        wireHint = type ? { type, side: fixedSide } : null;
        root.setPointerCapture(e.pointerId);
      }
      return;
    }

    const resizeEl = t.closest('[data-resize]');
    if (resizeEl) {
      const id = resizeEl.dataset.resize;
      const note = g.notes.find((n) => n.id === id);
      const gr = g.groups.find((n) => n.id === id);
      const item = note ?? gr;
      if (item) {
        drag = { kind: 'resize', id, what: note ? 'note' : 'group', start: w, init: { w: item.w, h: item.h } };
        root.setPointerCapture(e.pointerId);
      }
      return;
    }

    const edgeEl = t.closest('[data-edge]');
    if (edgeEl) {
      const id = edgeEl.dataset.edge;
      if (e.shiftKey) { const s = new Set(selection); s.has(id) ? s.delete(id) : s.add(id); ui.selection = s; }
      else select([id]);
      return;
    }

    const itemEl = t.closest('[data-node]') ?? t.closest('[data-note]') ?? t.closest('[data-group-header]');
    if (itemEl) {
      const id = itemEl.dataset.node ?? itemEl.dataset.note ?? itemEl.dataset.groupHeader;
      let sel = new Set(selection);
      if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); }
      else if (!sel.has(id)) sel = new Set([id]);
      ui.selection = sel;
      if (!sel.has(id)) return;
      // items to move: selection + contents of selected groups
      const ids = new Set();
      for (const sid of sel) {
        if (g.edges.some((ed) => ed.id === sid)) continue;
        ids.add(sid);
        if (g.groups.some((gr) => gr.id === sid)) for (const c of groupContents(sid)) ids.add(c);
      }
      const init = {};
      for (const iid of ids) { const r = itemRect(iid); if (r) init[iid] = { x: r.x, y: r.y }; }
      drag = { kind: 'items', start: w, ids: [...ids], init, moved: false, clickedId: id, shift: e.shiftKey };
      root.setPointerCapture(e.pointerId);
      return;
    }

    // background: double-click opens the palette (pointer capture eats native dblclick)
    const prev = lastDown;
    lastDown = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (prev && performance.now() - prev.t < 400 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6) {
      lastDown = null;
      e.preventDefault(); // keep focus from jumping to the canvas after the palette mounts
      openPalette({ x: e.clientX, y: e.clientY }, w);
      return;
    }
    if (e.shiftKey) {
      drag = { kind: 'marquee', start: w, cur: w, base: new Set(selection) }; // shift: marquee select
    } else {
      select([]);
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }; // plain drag: pan
      panning = true;
    }
    root.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const w = toWorld(e.clientX, e.clientY);
    mouseWorld.x = w.x; mouseWorld.y = w.y;
    const now = performance.now();
    if (now - lastAware > 40) { lastAware = now; S.setCursor(w); }
    const d = drag;
    if (!d) return;
    switch (d.kind) {
      case 'pan':
        ui.view = { ...ui.view, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) };
        break;
      case 'marquee': {
        d.cur = w;
        const r = { x: Math.min(d.start.x, w.x), y: Math.min(d.start.y, w.y), w: Math.abs(w.x - d.start.x), h: Math.abs(w.y - d.start.y) };
        marquee = r;
        const sel = new Set(d.base);
        const g = live.graph;
        for (const n of [...g.nodes, ...g.notes]) { const ir = itemRect(n.id); if (ir && intersects(r, ir)) sel.add(n.id); }
        for (const gr of g.groups) { const ir = itemRect(gr.id); if (ir && ir.x >= r.x && ir.y >= r.y && ir.x + ir.w <= r.x + r.w && ir.y + ir.h <= r.y + r.h) sel.add(gr.id); }
        ui.selection = sel;
        break;
      }
      case 'items': {
        const dx = w.x - d.start.x, dy = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * ui.view.k < 3) return;
        d.moved = true;
        dragging = true;
        const pos = {};
        for (const id of d.ids) pos[id] = { x: d.init[id].x + dx, y: d.init[id].y + dy };
        local = pos;
        if (now - lastAware > 30) S.setAwareDrag(pos);
        break;
      }
      case 'wire': {
        if (Math.hypot(w.x - d.start.x, w.y - d.start.y) * ui.view.k > 3) d.moved = true;
        d.pos = w;
        const fixed = fixedPoint(d);
        if (fixed) liveWire = d.fixedSide === 'from' ? { a: fixed, b: w, type: d.type } : { a: w, b: fixed, type: d.type };
        break;
      }
      case 'resize': {
        resizing = { [d.id]: { w: Math.max(80, d.init.w + (w.x - d.start.x)), h: Math.max(40, d.init.h + (w.y - d.start.y)) } };
        break;
      }
    }
  }

  function fixedPoint(d) {
    if (d.fixedEnd) {
      const g = live.graph;
      const n = g.byId.get(d.fixedEnd.node);
      if (!n) return null;
      return portPos(n, d.fixedSide === 'from' ? 'out' : 'in', d.fixedEnd.port, g.edges, positions[n.id]);
    }
    return d.fixedPos ?? null;
  }

  function finishWire(d, cx, cy) {
    const g = live.graph;
    const el = document.elementFromPoint(cx, cy);
    const portEl = el?.closest('[data-port]');
    const nodeEl = el?.closest('[data-node]');
    const wantSide = d.fixedSide === 'from' ? 'in' : 'out';
    let target = null;
    if (portEl && portEl.dataset.port === wantSide) target = { node: portEl.dataset.node, port: portEl.dataset.name };
    else if (nodeEl && d.type) {
      const nid = nodeEl.dataset.node;
      if (d.fixedSide === 'from') { const p = S.firstCompatibleInput(nid, d.type); if (p) target = { node: nid, port: p }; }
      else {
        const n = g.byId.get(nid);
        const o = n && getPortDefs(n).outputs.find((o) => canConnect(o.type, d.type));
        if (o) target = { node: nid, port: o.name };
      }
    }
    if (target && d.fixedEnd) {
      const from = d.fixedSide === 'from' ? d.fixedEnd : target;
      const to = d.fixedSide === 'from' ? target : d.fixedEnd;
      if (from.node !== to.node && S.connect(from, to, d.edgeId)) return;
    } else if (target && d.edgeId) {
      const e = { id: d.edgeId };
      if (d.fixedSide === 'from') { e.fromPos = d.fixedPos; e.to = target; } else { e.toPos = d.fixedPos; e.from = target; }
      if (e.to) for (const ed of g.edges) if (ed.id !== e.id && ed.to?.node === e.to.node && ed.to.port === e.to.port) S.removeEdge(ed.id);
      S.setEdge(e);
      return;
    }
    // leave it dangling
    if (!d.moved && !d.edgeId) return;
    const pos = { x: Math.round(d.pos.x), y: Math.round(d.pos.y) };
    const e = { id: d.edgeId ?? S.uid() };
    if (d.fixedSide === 'from') { if (d.fixedEnd) e.from = d.fixedEnd; else e.fromPos = d.fixedPos; e.toPos = pos; }
    else { if (d.fixedEnd) e.to = d.fixedEnd; else e.toPos = d.fixedPos; e.fromPos = pos; }
    S.setEdge(e);
  }

  function endDrag(e) {
    const d = drag;
    drag = null;
    panning = false;
    dragging = false;
    marquee = null;
    liveWire = null;
    wireHint = null;
    hiddenEdge = null;
    if (!d) return;
    if (d.kind === 'items') {
      if (d.moved) {
        const pos = {};
        for (const id of d.ids) pos[id] = local[id] ?? d.init[id];
        S.moveItems(pos);
        S.setAwareDrag(null);
      } else if (!d.shift && ui.selection.size > 1) select([d.clickedId]);
      local = {};
    } else if (d.kind === 'wire' && e) {
      finishWire(d, e.clientX, e.clientY);
    } else if (d.kind === 'resize') {
      const r = resizing[d.id];
      if (r) (d.what === 'note' ? S.updateNote : S.updateGroup)(d.id, { w: Math.round(r.w), h: Math.round(r.h) });
      resizing = {};
    }
  }
  function onPointerUp(e) {
    endDrag(e);
    try { root.releasePointerCapture(e.pointerId); } catch {}
  }
  function onContextMenu(e) {
    if (isTyping(e.target)) return;
    e.preventDefault();
    openPalette({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
  }

  // ---------- keyboard & clipboard ----------
  function duplicate(ids, offset = { x: 40, y: 40 }) {
    select(S.importPatch(S.exportPatch(ids), offset));
  }
  function groupSelection() {
    const g = live.graph;
    const sel = [...ui.selection].filter((id) => !g.edges.some((e) => e.id === id) && !g.groups.some((gr) => gr.id === id));
    let rect = union(sel.map((id) => itemRect(id)).filter(Boolean));
    if (!rect) rect = { x: mouseWorld.x - 160, y: mouseWorld.y - 100, w: 320, h: 220 };
    const pad = 24;
    select([S.addGroup({ x: rect.x - pad, y: rect.y - pad - 26, w: rect.w + pad * 2, h: rect.h + pad * 2 + 26 })]);
  }
  function onKey(e) {
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const sel = ui.selection;
    if (e.key === ' ') { space = true; e.preventDefault(); return; }
    if (e.key === 'Escape') {
      if (drag) { endDrag(); return; }
      if (ui.palette) ui.palette = null; else select([]);
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) { e.preventDefault(); S.removeItems(sel); select([]); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.undoManager.redo() : S.undoManager.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); S.undoManager.redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); select(allItemIds()); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (sel.size) duplicate(sel); return; }
    if (mod) return;
    const m = mouseWorld;
    if (e.key === 'Tab') {
      e.preventDefault();
      const r = root.getBoundingClientRect();
      const v = ui.view;
      openPalette({ x: r.left + m.x * v.k + v.x, y: r.top + m.y * v.k + v.y }, { x: m.x, y: m.y });
      return;
    }
    if (e.key === 'n') { e.preventDefault(); select([S.addNote(m.x - 100, m.y - 20)]); return; }
    if (e.key === 'g') { e.preventDefault(); groupSelection(); return; }
    if (e.key === 'f') { e.preventDefault(); fitTo(sel.size ? [...sel] : allItemIds()); return; }
    if (e.key === '0') { e.preventDefault(); ui.view = { ...ui.view, k: 1 }; return; }
  }
  const onKeyUp = (e) => { if (e.key === ' ') space = false; };
  function onCopy(e) {
    if (isTyping(document.activeElement) || !ui.selection.size) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', JSON.stringify(S.exportPatch(ui.selection), null, 1));
  }
  function onCut(e) {
    if (isTyping(document.activeElement) || !ui.selection.size) return;
    onCopy(e);
    S.removeItems(ui.selection);
    select([]);
  }
  function onPaste(e) {
    if (isTyping(document.activeElement)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim()) return;
    e.preventDefault();
    const m = mouseWorld;
    try {
      const p = JSON.parse(text);
      if (p && p.version === 1 && Array.isArray(p.nodes)) {
        const rects = [...p.nodes.map((n) => ({ x: n.x, y: n.y, w: 190, h: 100 })), ...(p.notes ?? []), ...(p.groups ?? [])];
        const b = union(rects);
        const off = b ? { x: Math.round(m.x - b.x), y: Math.round(m.y - b.y) } : { x: 0, y: 0 };
        select(S.importPatch(p, off));
        return;
      }
    } catch {}
    select([S.addNote(m.x, m.y, text.slice(0, 2000))]);
  }

  // ---------- derived render data ----------
  const remoteSel = $derived.by(() => {
    const m = new Map();
    for (const r of live.remotes) for (const id of r.selection ?? []) if (!m.has(id)) m.set(id, r.user.color);
    return m;
  });
  const connectedByNode = $derived.by(() => {
    const m = new Map();
    for (const n of graph.nodes) m.set(n.id, [...connectedInputs(n.id, graph.edges)].sort().join(','));
    return m;
  });
  const wires = $derived.by(() => {
    const out = [];
    for (const e of graph.edges) {
      if (e.id === hiddenEdge) continue;
      let a = null, b = null, type = null;
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
  });
  const posOf = (item) => positions[item.id] ?? item;
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />
<svelte:document oncopy={onCopy} oncut={onCut} onpaste={onPaste} />

<div bind:this={root} class="canvas" class:wiring={!!wireHint} class:panning class:dragging
  onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}
  oncontextmenu={onContextMenu} onpointerleave={() => S.setCursor(null)}
  style:background-position="{view.x}px {view.y}px" style:background-size="{24 * view.k}px {24 * view.k}px">
  <div class="world" style:transform="translate({view.x}px, {view.y}px) scale({view.k})">
    {#each graph.groups as g (g.id)}
      {@const p = posOf(g)}
      {@const r = resizing[g.id]}
      <GroupView group={r ? { ...g, ...r } : g} x={p.x} y={p.y} selected={selection.has(g.id)} />
    {/each}
    <Wires {wires} selected={selection} preview={liveWire} />
    {#each graph.notes as n (n.id)}
      {@const p = posOf(n)}
      {@const r = resizing[n.id]}
      <NoteView note={r ? { ...n, ...r } : n} x={p.x} y={p.y} selected={selection.has(n.id)} remoteColor={remoteSel.get(n.id)} />
    {/each}
    {#each graph.nodes as n (n.id)}
      {@const p = posOf(n)}
      <NodeView node={n} connected={connectedByNode.get(n.id) ?? ''} x={p.x} y={p.y} selected={selection.has(n.id)} remoteColor={remoteSel.get(n.id)} wire={wireHint} />
    {/each}
    <Cursors remotes={live.remotes} k={view.k} />
    {#if marquee}<div class="marquee" style:left="{marquee.x}px" style:top="{marquee.y}px" style:width="{marquee.w}px" style:height="{marquee.h}px"></div>{/if}
  </div>
</div>
