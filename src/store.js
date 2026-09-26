import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { canConnect } from './types.js';
import { DEFS } from './nodes/defs.js';
import { getPortDefs, findOutput, findInput, connectedInputs } from './nodes/ports.js';
import { createsCycle, isReservedName } from './compile.js';

export const LOCAL = 'local';
export const uid = () => Math.random().toString(36).slice(2, 9);
// ---------- room ----------
function pickRoom() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (h) return h;
  const words = ['amber', 'birch', 'coral', 'dune', 'ember', 'fern', 'glade', 'harbor', 'iris', 'juniper', 'kelp', 'lumen', 'moss', 'nova', 'opal', 'pine', 'quartz', 'reed', 'sable', 'tide'];
  const r = `${words[Math.floor(Math.random() * words.length)]}-${Math.random().toString(36).slice(2, 6)}`;
  location.replace(`#${r}`);
  return r;
}
export const room = pickRoom();
// ---------- doc ----------
export const doc = new Y.Doc();
export const yNodes = doc.getMap('nodes');
export const yEdges = doc.getMap('edges');
export const yNotes = doc.getMap('notes');
export const yGroups = doc.getMap('groups');

export const undoManager = new Y.UndoManager([yNodes, yEdges, yNotes, yGroups], {
  trackedOrigins: new Set([LOCAL]),
  captureTimeout: 400,
});

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/yjs`;
export const provider = new WebsocketProvider(wsUrl, room, doc);
export const awareness = provider.awareness;
window.__patch = { doc, provider, awareness };
const idb = new IndexeddbPersistence(`patch-${room}`, doc);
// ---------- identity ----------
const ANIMALS = ['otter', 'heron', 'lynx', 'newt', 'ibis', 'koala', 'moth', 'finch', 'gecko', 'yak', 'quail', 'seal', 'wren', 'puma', 'crab'];
const ADJ = ['brisk', 'mellow', 'quiet', 'sunny', 'wobbly', 'zesty', 'lucid', 'plucky', 'snug', 'dapper', 'perky', 'witty'];
const COLORS = ['#ef6b6b', '#f0a23b', '#2fb886', '#4f86f7', '#b76ee0', '#e86aa6', '#1fb5c8', '#9bc53d'];
function loadUser() {
  try {
    const s = localStorage.getItem('patch-user');
    if (s) return JSON.parse(s);
  } catch {}
  const u = {
    name: `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  try { localStorage.setItem('patch-user', JSON.stringify(u)); } catch {}
  return u;
}
export const me = loadUser();
awareness.setLocalStateField('user', me);

export function setCursor(pos) {
  awareness.setLocalStateField('cursor', pos);
}
export function setAwareSelection(ids) {
  awareness.setLocalStateField('selection', ids);
}
export function setAwareDrag(positions) {
  awareness.setLocalStateField('drag', positions);
}
// ---------- snapshot ----------
;

let version = 0;
let snapshot = null;
const listeners = new Set();
doc.on('update', () => {
  version++;
  snapshot = null;
  for (const l of listeners) l();
});
export function subscribe(l) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getGraph() {
  if (snapshot) return snapshot;
  const nodes = [];
  for (const [id, m] of yNodes) {
    const n = m.toJSON();
    n.id = id;
    n.params = n.params ?? {};
    nodes.push(n);
  }
  const edges = [...yEdges.values()];
  const notes = [...yNotes].map(([id, m]) => ({ ...(m.toJSON()), id }));
  const groups = [...yGroups].map(([id, m]) => ({ ...(m.toJSON()), id }));
  snapshot = { nodes, edges, notes, groups, byId: new Map(nodes.map((n) => [n.id, n])) };
  return snapshot;
}
export const getVersion = () => version;
// ---------- mutations ----------
export function tx(fn) {
  doc.transact(fn, LOCAL);
}

function nodeMap(n) {
  const m = new Y.Map();
  m.set('type', n.type);
  m.set('name', n.name);
  m.set('x', n.x);
  m.set('y', n.y);
  const p = new Y.Map();
  for (const [k, v] of Object.entries(n.params ?? {})) p.set(k, v);
  m.set('params', p);
  if (n.ports) m.set('ports', n.ports);
  return m;
}

export function uniqueName(type, taken) {
  const names = taken ?? new Set(getGraph().nodes.map((n) => n.name));
// pure nodes become variables in the sketch: avoid names that shadow p5 globals
  const makesVar = DEFS[type]?.outputs.some((o) => o.type !== 'draw');
  if (!names.has(type) && !(makesVar && isReservedName(type))) return type;
  let i = 2;
  while (names.has(`${type}${i}`)) i++;
  return `${type}${i}`;
}

export function addNode(type, x, y) {
  const def = DEFS[type];
  if (!def) return null;
  if (def.singleton && getGraph().nodes.some((n) => n.type === type)) return null;
  const id = uid();
  const params = {};
  const n = { id, type, name: uniqueName(type), x: Math.round(x), y: Math.round(y), params };
  const portsParam = def.params?.find((p) => p.widget === 'ports');
  if (portsParam) n.ports = JSON.parse(JSON.stringify(portsParam.default));
  tx(() => yNodes.set(id, nodeMap(n)));
  return id;
}

export function setParam(id, name, value) {
  const m = yNodes.get(id);
  if (!m) return;
  tx(() => (m.get('params')).set(name, value));
}
export function setNodeField(id, field, value) {
  const m = yNodes.get(id);
  if (!m) return;
  tx(() => m.set(field, value));
}
export function renameNode(id, name) {
  const clean = name.trim();
  if (!clean) return;
  setNodeField(id, 'name', clean);
}
export function setPorts(id, ports) {
  const m = yNodes.get(id);
  if (!m) return;
  tx(() => {
    m.set('ports', ports);
// prune edges to removed ports
    const inNames = new Set(ports.inputs.map((p) => p.name));
    const outNames = new Set(ports.outputs.map((p) => p.name));
    const def = DEFS[m.get('type')];
    for (const p of def?.inputs ?? []) inNames.add(p.name);
    for (const p of def?.outputs ?? []) outNames.add(p.name);
    for (const [eid, e] of yEdges) {
      if ((e.to?.node === id && !inNames.has(e.to.port)) || (e.from?.node === id && !outNames.has(e.from.port))) yEdges.delete(eid);
    }
  });
}

/** move nodes/notes/groups by id */
export function moveItems(pos) {
  tx(() => {
    for (const [id, p] of Object.entries(pos)) {
      const m = yNodes.get(id) ?? yNotes.get(id) ?? yGroups.get(id);
      if (!m) continue;
      m.set('x', Math.round(p.x));
      m.set('y', Math.round(p.y));
    }
  });
}

export function removeItems(ids) {
  const set = new Set(ids);
  tx(() => {
    for (const id of set) {
      if (yNodes.has(id)) {
        if (DEFS[yNodes.get(id) .get('type')]?.singleton) continue;
        yNodes.delete(id);
        for (const [eid, e] of yEdges) if (e.from?.node === id || e.to?.node === id) yEdges.delete(eid);
      } else if (yEdges.has(id)) yEdges.delete(id);
      else if (yNotes.has(id)) yNotes.delete(id);
      else if (yGroups.has(id)) yGroups.delete(id);
    }
  });
}

export function portType(end, side) {
  const g = getGraph();
  const n = g.byId.get(end.node);
  if (!n) return null;
  if (side === 'from') return findOutput(n, end.port)?.type ?? null;
  return findInput(n, end.port, connectedInputs(n.id, g.edges))?.type ?? null;
}

export function canLink(from, to) {
  const a = portType(from, 'from'), b = portType(to, 'to');
  if (!a || !b) return false;
  if (!canConnect(a, b)) return false;
  const edges = getGraph().edges;
  return !createsCycle(edges, from.node, to.node);
}

/** connect two ports (optionally reusing an existing loose edge). Returns the edge id or null. */
export function connect(from, to, reuseId) {
  if (!canLink(from, to)) return null;
  const id = reuseId ?? uid();
  tx(() => {
    for (const [eid, e] of yEdges) if (eid !== id && e.to?.node === to.node && e.to.port === to.port) yEdges.delete(eid);
    yEdges.set(id, { id, from, to });
  });
  return id;
}

export function setEdge(e) {
  tx(() => yEdges.set(e.id, e));
}
export function removeEdge(id) {
  tx(() => yEdges.delete(id));
}

/** first free input on a node compatible with a type */
export function firstCompatibleInput(nodeId, type) {
  const g = getGraph();
  const n = g.byId.get(nodeId);
  if (!n) return null;
  const conn = connectedInputs(nodeId, g.edges);
  const { inputs } = getPortDefs(n);
// variadic first (expand)
  for (const p of inputs) {
    if (p.variadic) {
      if (!canConnect(type, p.type)) continue;
      let i = 0;
      while (conn.has(`${p.name}${i}`)) i++;
      return `${p.name}${i}`;
    }
  }
  for (const p of inputs) if (!p.variadic && !conn.has(p.name) && canConnect(type, p.type)) return p.name;
  return null;
}
// notes & groups
const NOTE_COLORS = ['#fff3a3', '#ffd6e0', '#d8f1ff', '#dff5d8', '#efe2ff', '#ffe4c2'];
export function addNote(x, y, text = '') {
  const id = uid();
  const m = new Y.Map();
  m.set('x', Math.round(x)); m.set('y', Math.round(y)); m.set('w', 200); m.set('h', 120);
  m.set('text', text); m.set('color', NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]);
  tx(() => yNotes.set(id, m));
  return id;
}
export function nextNoteColor(c) {
  return NOTE_COLORS[(NOTE_COLORS.indexOf(c) + 1) % NOTE_COLORS.length];
}
export function updateNote(id, patch) {
  const m = yNotes.get(id);
  if (!m) return;
  tx(() => { for (const [k, v] of Object.entries(patch)) m.set(k, v); });
}
export function addGroup(rect, name = 'group') {
  const id = uid();
  const m = new Y.Map();
  m.set('x', Math.round(rect.x)); m.set('y', Math.round(rect.y)); m.set('w', Math.round(rect.w)); m.set('h', Math.round(rect.h));
  m.set('name', name); m.set('color', COLORS[Math.floor(Math.random() * COLORS.length)]);
  tx(() => yGroups.set(id, m));
  return id;
}
export function updateGroup(id, patch) {
  const m = yGroups.get(id);
  if (!m) return;
  tx(() => { for (const [k, v] of Object.entries(patch)) m.set(k, v); });
}
// ---------- import / export ----------
export function exportPatch(ids) {
  const g = getGraph();
  const pick = (id) => !ids || ids.has(id);
  const nodes = g.nodes.filter((n) => pick(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => {
    if (ids) return e.from && e.to && nodeIds.has(e.from.node) && nodeIds.has(e.to.node);
    return true;
  });
  return { version: 1, nodes, edges, notes: g.notes.filter((n) => pick(n.id)), groups: g.groups.filter((n) => pick(n.id)) };
}

/** import with fresh ids; returns the new ids */
export function importPatch(p, offset = { x: 0, y: 0 }, keepIds = false) {
  const idMap = new Map();
  const fresh = (id) => {
    if (keepIds) return id;
    let n = idMap.get(id);
    if (!n) idMap.set(id, (n = uid()));
    return n;
  };
  const created = [];
  const taken = new Set(getGraph().nodes.map((n) => n.name));
  const hasCanvas = getGraph().nodes.some((n) => n.type === 'canvas');
  tx(() => {
    for (const n of p.nodes ?? []) {
      if (!DEFS[n.type]) continue;
      if (DEFS[n.type].singleton && hasCanvas) continue;
      const id = fresh(n.id);
      let name = n.name;
      if (taken.has(name)) name = uniqueName(n.type, taken);
      taken.add(name);
      yNodes.set(id, nodeMap({ ...n, id, name, x: n.x + offset.x, y: n.y + offset.y }));
      created.push(id);
    }
    for (const e of p.edges ?? []) {
      if (!e.from || !e.to) continue;
      if (!keepIds && (!idMap.has(e.from.node) || !idMap.has(e.to.node))) continue;
      const id = fresh(e.id);
      yEdges.set(id, { id, from: { node: fresh(e.from.node), port: e.from.port }, to: { node: fresh(e.to.node), port: e.to.port } });
    }
    for (const n of p.notes ?? []) {
      const id = fresh(n.id);
      const m = new Y.Map();
      m.set('x', n.x + offset.x); m.set('y', n.y + offset.y); m.set('w', n.w); m.set('h', n.h); m.set('text', n.text); m.set('color', n.color);
      yNotes.set(id, m);
      created.push(id);
    }
    for (const g of p.groups ?? []) {
      const id = fresh(g.id);
      const m = new Y.Map();
      m.set('x', g.x + offset.x); m.set('y', g.y + offset.y); m.set('w', g.w); m.set('h', g.h); m.set('name', g.name); m.set('color', g.color);
      yGroups.set(id, m);
      created.push(id);
    }
  });
  return created;
}

export function clearAll() {
  tx(() => {
    for (const k of [...yNodes.keys()]) yNodes.delete(k);
    for (const k of [...yEdges.keys()]) yEdges.delete(k);
    for (const k of [...yNotes.keys()]) yNotes.delete(k);
    for (const k of [...yGroups.keys()]) yGroups.delete(k);
  });
}

export function loadPatch(p) {
  clearAll();
  importPatch(p, { x: 0, y: 0 }, true);
  ensureCanvas();
}

export function ensureCanvas() {
  if (!getGraph().nodes.some((n) => n.type === 'canvas')) addNode('canvas', 760, 120);
}

/** create or overwrite a node wholesale (params replaced) */
export function upsertNode(n) {
  const m = yNodes.get(n.id);
  if (!m) { yNodes.set(n.id, nodeMap(n)); return; }
  m.set('type', n.type); m.set('name', n.name); m.set('x', Math.round(n.x)); m.set('y', Math.round(n.y));
  const p = m.get('params');
  for (const k of [...p.keys()]) if (!(k in n.params)) p.delete(k);
  for (const [k, v] of Object.entries(n.params)) if (JSON.stringify(p.get(k)) !== JSON.stringify(v)) p.set(k, v);
  if (n.ports) { if (JSON.stringify(m.get('ports')) !== JSON.stringify(n.ports)) m.set('ports', n.ports); }
  else if (m.has('ports')) m.delete('ports');
}
export function setCanvasParams(params) {
  const c = [...yNodes.values()].find((m) => m.get('type') === 'canvas');
  if (!c) return;
  const p = c.get('params');
  for (const [k, v] of Object.entries(params)) if (JSON.stringify(p.get(k)) !== JSON.stringify(v)) p.set(k, v);
}
export function replaceEdges(edges) {
  const next = new Map(edges.map((e) => [e.id, e]));
  for (const k of [...yEdges.keys()]) if (!next.has(k)) yEdges.delete(k);
  for (const [k, e] of next) if (JSON.stringify(yEdges.get(k)) !== JSON.stringify(e)) yEdges.set(k, e);
}
export function deleteNodes(ids) {
  for (const id of ids) yNodes.delete(id);
}

/** seed once storage & network have had a chance to sync */
export function whenReady() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    idb.whenSynced.then(() => {
      if (provider.synced) finish();
      else {
        const onSync = (s) => { if (s) { provider.off('sync', onSync); finish(); } };
        provider.on('sync', onSync);
        setTimeout(finish, 1500);
      }
    });
  });
}

Object.assign(window.__patch, { loadPatch, importPatch, exportPatch, clearAll, getGraph, addNode, connect, setParam, removeItems });
