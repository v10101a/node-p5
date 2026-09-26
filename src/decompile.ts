/**
 * sketch.js → patch. Best effort, never lossy: statements the parser understands become typed
 * nodes; anything else becomes a code block that runs verbatim at that point in draw order.
 * Nodes whose compiled lines are unchanged in the edited text are kept as they are.
 */
import * as acorn from 'acorn';
import { compile, type CompileOutput } from './compile';
import { DEFS } from './nodes/defs';
import { getPortDefs, connectedInputs, VARIADIC_RE } from './nodes/ports';
import { canConnect, type NodeData, type EdgeData, type PortType } from './types';
import { estimateHeight, nodeWidth } from './canvas/layout';

export const STARTER_SKETCH = `var num;

function setup() {
  createCanvas(400, 400);
  num = 0;
}

function draw() {
  background(220);
  num = num + 10;
  fill(num%255, 500, 50);
  noStroke();
  circle(mouseX, mouseY, 50 + sin(frameCount * 0.05) * 20);
  stroke(255,0,0);
  line(0, height, width, 0 / 2);
}
`;

type N = any;
const HELPER_NAMES = new Set(['hsbColor', 'mixColors', 'waveform', 'formatValue']);
const STYLE_FNS = new Set(['fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'textSize', 'textAlign', 'rectMode']);
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*([(){}[\],;])\s*/g, '$1').trim();
const uid = () => Math.random().toString(36).slice(2, 9);

interface Ref { ref: string }
type Val = number | string | Ref;
type ColorVal = number[] | string | null | Ref;

interface Style {
  fill?: ColorVal; stroke?: ColorVal; weight?: Val; textSize?: Val; textAlign?: string; rectMode?: string;
}
interface Item {
  type: string;
  params: Record<string, any>;
  children?: Item[];
  matched?: NodeData;
  id?: string;
  name?: string;
}
interface ExprNode { name: string; expr: string; kind: string; matched?: NodeData; id?: string }

export interface Plan {
  keep: Set<string>;
  upserts: NodeData[];
  edges: EdgeData[];
  remove: string[];
  canvasParams: Record<string, any>;
}

interface Src { code: string }

// ---------- expressions ----------
function fold(n: N): number | undefined {
  if (!n) return undefined;
  if (n.type === 'Literal' && typeof n.value === 'number') return n.value;
  if (n.type === 'UnaryExpression' && n.operator === '-') { const v = fold(n.argument); return v === undefined ? undefined : -v; }
  if (n.type === 'UnaryExpression' && n.operator === '+') return fold(n.argument);
  if (n.type === 'BinaryExpression') {
    const a = fold(n.left), b = fold(n.right);
    if (a === undefined || b === undefined) return undefined;
    switch (n.operator) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': return b === 0 ? undefined : a / b; case '%': return b === 0 ? undefined : a % b;
    }
  }
  return undefined;
}
function argOf(n: N, s: Src): Val {
  if (!n) return 0;
  const f = fold(n);
  if (f !== undefined) return Number.isFinite(f) ? Math.round(f * 1e6) / 1e6 : 0;
  if (n.type === 'Identifier') return { ref: n.name };
  return s.code.slice(n.start, n.end);
}
function colorOf(args: N[], s: Src): ColorVal {
  if (!args.length) return null;
  const nums = args.map(fold);
  const allNum = nums.every((v) => v !== undefined);
  if (allNum) {
    const v = nums as number[];
    if (args.length === 1) return [v[0], v[0], v[0], 255];
    if (args.length === 2) return [v[0], v[0], v[0], v[1]];
    if (args.length === 3) return [v[0], v[1], v[2], 255];
    if (args.length === 4) return [v[0], v[1], v[2], v[3]];
  }
  if (args.length === 1) {
    const a = args[0];
    if (a.type === 'Identifier') return { ref: a.name };
    if (a.type === 'Literal' && typeof a.value === 'string' && /^#[0-9a-f]{6}$/i.test(a.value)) {
      const h = a.value;
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
    }
    if (a.type === 'ArrayExpression' && a.elements.every((e: N) => fold(e) !== undefined)) {
      const v = a.elements.map(fold) as number[];
      return [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? 255];
    }
  }
  return s.code.slice(args[0].start, args[args.length - 1].end);
}
function callOf(stmt: N): { name: string; args: N[] } | null {
  if (stmt?.type !== 'ExpressionStatement') return null;
  const e = stmt.expression;
  if (e?.type !== 'CallExpression' || e.callee.type !== 'Identifier') return null;
  return { name: e.callee.name, args: e.arguments };
}
function usesIdent(n: N, name: string): boolean {
  let found = false;
  const walk = (x: N) => {
    if (found || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.type === 'Identifier' && x.name === name) { found = true; return; }
    for (const k of Object.keys(x)) if (k !== 'loc' && k !== 'start' && k !== 'end') walk(x[k]);
  };
  walk(n);
  return found;
}

// ---------- statements → items ----------
const P5_DEFAULT_FILL = [255, 255, 255, 255];
const P5_DEFAULT_STROKE = [0, 0, 0, 255];

function applyStyle(st: Style, c: { name: string; args: N[] }, s: Src): boolean {
  switch (c.name) {
    case 'fill': st.fill = colorOf(c.args, s); return true;
    case 'noFill': st.fill = null; return true;
    case 'stroke': st.stroke = colorOf(c.args, s); return true;
    case 'noStroke': st.stroke = null; return true;
    case 'strokeWeight': st.weight = argOf(c.args[0], s); return true;
    case 'textSize': st.textSize = argOf(c.args[0], s); return true;
    case 'textAlign': st.textAlign = c.args[0]?.type === 'Identifier' ? c.args[0].name.toLowerCase() : undefined; return true;
    case 'rectMode': st.rectMode = c.args[0]?.type === 'Identifier' ? c.args[0].name.toLowerCase() : undefined; return true;
  }
  return false;
}
function styleParams(st: Style, which: { fill?: boolean; stroke?: boolean }): Record<string, any> {
  const p: Record<string, any> = {};
  if (which.fill !== false) p.fill = st.fill === undefined ? P5_DEFAULT_FILL : st.fill;
  if (which.stroke !== false) {
    p.stroke = st.stroke === undefined ? P5_DEFAULT_STROKE : st.stroke;
    p.weight = st.weight === undefined ? 1 : st.weight;
  }
  return p;
}

function shapeItem(c: { name: string; args: N[] }, st: Style, s: Src): Item | null {
  const a = c.args;
  const v = (i: number, d: Val = 0) => (a[i] ? argOf(a[i], s) : d);
  switch (c.name) {
    case 'background': return { type: 'background', params: { color: colorOf(a, s) } };
    case 'rect':
      if (a.length < 4) return null;
      return { type: 'rect', params: { x: v(0), y: v(1), w: v(2), h: v(3), radius: v(4, 0), mode: st.rectMode === 'center' ? 'center' : 'corner', ...styleParams(st, {}) } };
    case 'ellipse':
      if (a.length < 3) return null;
      return { type: 'ellipse', params: { x: v(0), y: v(1), w: v(2), h: a[3] ? v(3) : v(2), ...styleParams(st, {}) } };
    case 'circle':
      if (a.length < 3) return null;
      return { type: 'circle', params: { x: v(0), y: v(1), d: v(2), ...styleParams(st, {}) } };
    case 'line':
      if (a.length < 4) return null;
      return { type: 'line', params: { x1: v(0), y1: v(1), x2: v(2), y2: v(3), ...styleParams(st, { fill: false }) } };
    case 'text': {
      if (a.length < 3) return null;
      let text = '', value: Val | undefined;
      const t = a[0];
      const isFmt = (n: N) => n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'formatValue' && n.arguments.length === 1;
      if (t.type === 'Literal' && typeof t.value === 'string') text = t.value;
      else if (isFmt(t)) value = argOf(t.arguments[0], s);
      else if (t.type === 'BinaryExpression' && t.operator === '+' && isFmt(t.right) && t.left.type === 'BinaryExpression' && t.left.operator === '+' && t.left.left.type === 'Literal' && typeof t.left.left.value === 'string') {
        text = t.left.left.value; value = argOf(t.right.arguments[0], s);
      } else return null;
      const params: Record<string, any> = { text, x: v(1), y: v(2), size: st.textSize === undefined ? 12 : st.textSize, align: ['left', 'center', 'right'].includes(st.textAlign ?? '') ? st.textAlign : 'left', ...styleParams(st, { stroke: false }) };
      if (value !== undefined) params.value = value;
      return { type: 'text', params };
    }
    case 'image':
      if (a.length < 3) return null;
      return { type: 'image', params: { img: v(0), x: v(1), y: v(2), w: v(3, 0), h: v(4, 0) } };
  }
  return null;
}

function findPop(stmts: N[], i: number): number {
  let depth = 0;
  for (let j = i; j < stmts.length; j++) {
    const c = callOf(stmts[j]);
    if (c?.name === 'push') depth++;
    else if (c?.name === 'pop') { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function isSimpleLoop(f: N): { v: string; count: N } | null {
  if (f.type !== 'ForStatement' || !f.init || f.init.type !== 'VariableDeclaration' || f.init.declarations.length !== 1) return null;
  const d = f.init.declarations[0];
  if (d.id.type !== 'Identifier' || fold(d.init) !== 0) return null;
  const v = d.id.name;
  const t = f.test;
  if (!t || t.type !== 'BinaryExpression' || t.operator !== '<' || t.left.type !== 'Identifier' || t.left.name !== v) return null;
  const u = f.update;
  const okUpdate = (u?.type === 'UpdateExpression' && u.operator === '++' && u.argument.name === v) || (u?.type === 'AssignmentExpression' && u.operator === '+=' && u.left.name === v && fold(u.right) === 1);
  if (!okUpdate || f.body.type !== 'BlockStatement') return null;
  return { v, count: t.right };
}

function parseItems(stmts: N[], st: Style, s: Src): Item[] {
  const items: Item[] = [];
  let code: string[] = [];
  let pendingStyle: string[] = [];
  const text = (n: N) => s.code.slice(n.start, n.end);
  const flush = () => { if (code.length) { items.push({ type: 'drawcode', params: { code: code.join('\n') } }); code = []; } };
  const asCode = (t: string) => { code.push(...pendingStyle, t); pendingStyle = []; };

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const c = callOf(stmt);
    if (c && STYLE_FNS.has(c.name) && applyStyle(st, c, s)) {
      if (!(c.name === 'rectMode' && st.rectMode === 'corner')) pendingStyle.push(text(stmt));
      continue;
    }
    if (c) {
      const item = shapeItem(c, st, s);
      if (item) { flush(); items.push(item); pendingStyle = []; continue; }
    }
    if (c?.name === 'push') {
      const j = findPop(stmts, i);
      if (j > 0) {
        flush();
        const inner = stmts.slice(i + 1, j);
        const params: Record<string, any> = { x: 0, y: 0, rotate: 0, scale: 1 };
        let k = 0;
        while (k < inner.length) {
          const t = callOf(inner[k]);
          if (t?.name === 'translate') { params.x = argOf(t.args[0], s); params.y = t.args[1] ? argOf(t.args[1], s) : 0; }
          else if (t?.name === 'rotate') params.rotate = argOf(t.args[0], s);
          else if (t?.name === 'scale') params.scale = argOf(t.args[0], s);
          else break;
          k++;
        }
        const saved = { ...st };
        const children = parseItems(inner.slice(k), st, s);
        Object.assign(st, saved);
        const plain = params.x === 0 && params.y === 0 && params.rotate === 0 && params.scale === 1;
        if (plain && children.length === 1 && children[0].type === 'repeat') items.push(children[0]);
        else items.push({ type: 'transform', params, children });
        i = j;
        continue;
      }
    }
    const loop = stmt.type === 'ForStatement' ? isSimpleLoop(stmt) : null;
    if (loop) {
      const body: N[] = stmt.body.body.slice();
      const params: Record<string, any> = { count: argOf(loop.count, s), x: 0, y: 0, rotate: 0, scale: 1, mode: 'linear' };
      // trailing per-iteration steps
      const steps: N[] = [];
      while (body.length) {
        const t = callOf(body[body.length - 1]);
        if (t && (t.name === 'translate' || t.name === 'rotate' || t.name === 'scale')) steps.unshift(body.pop());
        else break;
      }
      const countSrc = norm(text(loop.count));
      for (const step of steps) {
        const t = callOf(step)!;
        if (t.name === 'translate') { params.x = argOf(t.args[0], s); params.y = t.args[1] ? argOf(t.args[1], s) : 0; }
        else if (t.name === 'rotate') {
          const r = t.args[0];
          if (r?.type === 'BinaryExpression' && r.operator === '/' && r.left.type === 'Identifier' && r.left.name === 'TWO_PI' && norm(text(r.right)) === countSrc) params.mode = 'radial';
          else params.rotate = argOf(r, s);
        } else if (t.name === 'scale') params.scale = argOf(t.args[0], s);
      }
      if (!body.some((b) => usesIdent(b, loop.v))) {
        flush();
        const saved = { ...st };
        const children = parseItems(body, st, s);
        Object.assign(st, saved);
        items.push({ type: 'repeat', params, children });
        continue;
      }
    }
    if (stmt.type === 'BlockStatement') {
      flush();
      items.push({ type: 'layers', params: {}, children: parseItems(stmt.body, st, s) });
      continue;
    }
    asCode(text(stmt));
  }
  flush();
  if (pendingStyle.length) items.push({ type: 'drawcode', params: { code: pendingStyle.join('\n') } });
  return items;
}

// ---------- the plan ----------
export function planFromCode(code: string, nodes: NodeData[], edges: EdgeData[]): Plan {
  const comments: N[] = [];
  const ast: N = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script', onComment: comments });
  const s: Src = { code };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const canvas = nodes.find((n) => n.type === 'canvas');
  if (!canvas) throw new Error('no canvas node');
  const compiled: CompileOutput = compile(nodes, edges, false);

  // ---- split the program ----
  let setupFn: N = null, drawFn: N = null;
  const topLevel: N[] = [];
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' && st.id?.name === 'setup') setupFn = st;
    else if (st.type === 'FunctionDeclaration' && st.id?.name === 'draw') drawFn = st;
    else if (st.type === 'FunctionDeclaration' && HELPER_NAMES.has(st.id?.name)) continue;
    else topLevel.push(st);
  }
  if (!drawFn) throw new Error('no draw() function found');
  const text = (n: N) => code.slice(n.start, n.end);
  const globalsStmts = topLevel.map((n) => ({ n, norm: norm(text(n)), used: false }));
  const setupStmts: { n: N; norm: string; used: boolean }[] = (setupFn?.body.body ?? []).map((n: N) => ({ n, norm: norm(text(n)), used: false }));
  const drawStmts: { n: N; norm: string; used: boolean }[] = drawFn.body.body.map((n: N) => ({ n, norm: norm(text(n)), used: false }));

  // ---- keep nodes whose compiled lines survive unchanged ----
  const keep = new Set<string>();
  const drawChildren = (id: string): NodeData[] => {
    const kids: { i: number; n: NodeData }[] = [];
    for (const e of edges) {
      if (e.to?.node !== id || !e.from) continue;
      const m = VARIADIC_RE.exec(e.to.port);
      if (!m || m[1] !== 'draw') continue;
      const n = byId.get(e.from.node);
      if (n) kids.push({ i: Number(m[2]), n });
    }
    return kids.sort((a, b) => a.i - b.i).map((k) => k.n);
  };
  for (const n of nodes) {
    if (n.type === 'canvas') continue;
    const seg = compiled.segments[n.id];
    if (!seg || !seg.body.length) continue;
    if (getPortDefs(n).outputs.some((o) => o.type === 'draw')) continue; // draw nodes are always re-read from the text
    const segText = seg.body.join('\n');
    let count = 0;
    try { count = acorn.parse(segText, { ecmaVersion: 2022, sourceType: 'script' }).body.length; } catch { continue; }
    const target = norm(segText);
    for (let i = 0; i + count <= drawStmts.length; i++) {
      const run = drawStmts.slice(i, i + count);
      if (run.some((r) => r.used)) continue;
      if (norm(run.map((r) => text(r.n)).join('\n')) !== target) continue;
      run.forEach((r) => (r.used = true));
      keep.add(n.id);
      for (const g of seg.globals) { const hit = globalsStmts.find((x) => !x.used && x.norm === norm(g)); if (hit) hit.used = true; }
      for (const g of seg.setup) { const hit = setupStmts.find((x) => !x.used && x.norm === norm(g)); if (hit) hit.used = true; }
      // a kept render node keeps everything drawn into it
      const stack = [n.id];
      while (stack.length) for (const k of drawChildren(stack.pop()!)) { if (!keep.has(k.id)) { keep.add(k.id); stack.push(k.id); } }
      break;
    }
  }
  // kept nodes' inputs come from other nodes: those must survive too (or the code would change)
  // (they are matched by their own segments above; if a source vanished, its edge is dropped)

  // ---- canvas params ----
  const canvasParams: Record<string, any> = { ...canvas.params };
  let sawCreate = false;
  for (const st of setupStmts) {
    const c = callOf(st.n);
    if (c?.name === 'createCanvas' && !st.used) {
      st.used = true; sawCreate = true;
      const w = argOf(c.args[0], s), h = argOf(c.args[1], s);
      canvasParams.width = typeof w === 'object' ? (w as Ref).ref : w;
      canvasParams.height = typeof h === 'object' ? (h as Ref).ref : h;
    }
  }
  void sawCreate;
  canvasParams.setup = setupStmts.filter((x) => !x.used).map((x) => text(x.n)).join('\n');
  canvasParams.globals = globalsStmts.filter((x) => !x.used).map((x) => text(x.n)).join('\n');

  // ---- remaining draw statements: expressions + drawing ----
  const exprs: ExprNode[] = [];
  const rest: N[] = [];
  for (const st of drawStmts) {
    if (st.used) continue;
    const n = st.n;
    if (n.type === 'VariableDeclaration' && n.declarations.length === 1 && n.declarations[0].id.type === 'Identifier' && n.declarations[0].init) {
      const d = n.declarations[0];
      const init = d.init;
      const kind = init.type === 'ArrayExpression' ? 'color' : init.type === 'ObjectExpression' ? 'vector' : (init.type === 'BinaryExpression' && ['<', '>', '<=', '>=', '===', '!==', '==', '!='].includes(init.operator)) || (init.type === 'Literal' && typeof init.value === 'boolean') ? 'boolean' : 'number';
      exprs.push({ name: d.id.name, expr: text(init), kind });
      continue;
    }
    rest.push(n);
  }
  const items = parseItems(rest, {}, s);

  // ---- identity: expressions by name, drawings by type order under the same parent ----
  const survivors = new Set<string>(keep);
  const takenNames = new Set<string>();
  for (const id of keep) takenNames.add(byId.get(id)!.name);
  const usedExisting = new Set<string>(keep);
  for (const ex of exprs) {
    const existing = nodes.find((n) => n.name === ex.name && !usedExisting.has(n.id) && n.type !== 'canvas');
    if (existing) { ex.matched = existing; ex.id = existing.id; usedExisting.add(existing.id); survivors.add(existing.id); }
    else ex.id = uid();
    let nm = ex.name;
    while (takenNames.has(nm)) nm += '_';
    ex.name = nm;
    takenNames.add(nm);
  }
  const matchItems = (list: Item[], pool: NodeData[]) => {
    const avail = pool.filter((n) => !usedExisting.has(n.id));
    for (const it of list) {
      const idx = avail.findIndex((n) => n.type === it.type);
      if (idx >= 0) { it.matched = avail[idx]; it.id = it.matched.id; usedExisting.add(it.id); survivors.add(it.id); avail.splice(idx, 1); }
      else it.id = uid();
      if (it.children) matchItems(it.children, it.matched ? drawChildren(it.matched.id) : []);
    }
  };
  matchItems(items, drawChildren(canvas.id));
  const walkItems = (list: Item[], f: (it: Item, parent: Item | null, depth: number) => void, parent: Item | null = null, depth = 1) => {
    for (const it of list) { f(it, parent, depth); if (it.children) walkItems(it.children, f, it, depth + 1); }
  };
  const nameFor = (type: string) => {
    const base = type === 'drawcode' ? 'block' : type;
    let nm = base, k = 2;
    const makesVar = DEFS[type]?.outputs.some((o) => o.type !== 'draw');
    if (makesVar || takenNames.has(nm)) { nm = `${base}${makesVar ? 1 : k++}`; while (takenNames.has(nm)) nm = `${base}${k++}`; }
    takenNames.add(nm);
    return nm;
  };
  walkItems(items, (it) => { it.name = it.matched ? it.matched.name : nameFor(it.type); });

  // ---- resolve identifier references to wires ----
  const varMap: Record<string, { node: string; port: string; type: PortType }> = {};
  for (const [v, ref] of Object.entries(compiled.vars)) {
    if (!survivors.has(ref.node) || !keep.has(ref.node)) continue;
    const n = byId.get(ref.node)!;
    const t = getPortDefs(n).outputs.find((o) => o.name === ref.port)?.type;
    if (t) varMap[v] = { ...ref, type: t };
  }
  for (const ex of exprs) varMap[ex.name] = { node: ex.id!, port: 'out', type: ex.kind as PortType };

  const newEdges: EdgeData[] = [];
  const consumersOf = new Map<string, number>(); // expr node id → max depth of consumer
  const resolveParams = (it: Item, depth: number) => {
    const def = DEFS[it.type];
    const inputs = def ? getPortDefs({ id: it.id!, type: it.type, name: '', x: 0, y: 0, params: {} }).inputs : [];
    for (const [k, v] of Object.entries(it.params)) {
      if (!v || typeof v !== 'object' || !('ref' in v)) continue;
      const ref = (v as Ref).ref;
      const port = inputs.find((p) => p.name === k);
      const target = varMap[ref];
      if (port && target && canConnect(target.type, port.type)) {
        newEdges.push({ id: uid(), from: { node: target.node, port: target.port }, to: { node: it.id!, port: k } });
        delete it.params[k];
        consumersOf.set(target.node, Math.max(consumersOf.get(target.node) ?? 0, depth));
      } else it.params[k] = ref; // plain expression text
    }
  };
  walkItems(items, (it, _p, depth) => resolveParams(it, depth));
  // draw edges
  const drawEdges = (parentId: string, list: Item[]) => {
    list.forEach((it, i) => { newEdges.push({ id: uid(), from: { node: it.id!, port: 'out' }, to: { node: parentId, port: `draw${i}` } }); if (it.children) drawEdges(it.id!, it.children); });
  };
  drawEdges(canvas.id, items);

  // ---- build node records ----
  const upserts: NodeData[] = [];
  const placed: NodeData[] = nodes.filter((n) => survivors.has(n.id) || n.type === 'canvas');
  const colX = (depth: number) => canvas.x - 290 * depth;
  const colY: Record<number, number> = {};
  const nextY = (depth: number, h: number) => {
    if (colY[depth] === undefined) {
      let y = canvas.y;
      for (const n of placed) if (Math.abs(n.x - colX(depth)) < 150) y = Math.max(y, n.y + estimateHeight(n, edges) + 24);
      colY[depth] = y;
    }
    const y = colY[depth];
    colY[depth] = y + h + 24;
    return y;
  };
  walkItems(items, (it, _p, depth) => {
    const rec: NodeData = { id: it.id!, type: it.type, name: it.name!, x: 0, y: 0, params: it.params };
    if (it.matched) { rec.x = it.matched.x; rec.y = it.matched.y; if (it.matched.ports) rec.ports = it.matched.ports; }
    else { rec.x = colX(depth); rec.y = nextY(depth, estimateHeight(rec, [])); placed.push(rec); }
    upserts.push(rec);
  });
  for (const ex of exprs) {
    const rec: NodeData = { id: ex.id!, type: 'expr', name: ex.name, x: 0, y: 0, params: { expr: ex.expr, kind: ex.kind }, ports: { inputs: [], outputs: [{ name: 'out', type: ex.kind as PortType }] } };
    if (ex.matched) { rec.x = ex.matched.x; rec.y = ex.matched.y; }
    else { const depth = (consumersOf.get(ex.id!) ?? 0) + 1; rec.x = colX(depth); rec.y = nextY(depth, estimateHeight(rec, [])); placed.push(rec); }
    upserts.push(rec);
  }
  const upsertIds = new Set(upserts.map((u) => u.id));
  const finalIds = new Set([...keep, ...upsertIds, canvas.id]);
  const remove = nodes.filter((n) => !finalIds.has(n.id)).map((n) => n.id);

  // kept nodes keep their incoming wires; loose wires survive if their ends do
  const edgesOut: EdgeData[] = [];
  for (const e of edges) {
    const fromOk = !e.from || finalIds.has(e.from.node);
    const toOk = !e.to || finalIds.has(e.to.node);
    if (!fromOk || !toOk) continue;
    if (e.from && e.to) { if (keep.has(e.to.node) && !upsertIds.has(e.to.node)) edgesOut.push(e); }
    else edgesOut.push(e);
  }
  edgesOut.push(...newEdges);
  return { keep, upserts, edges: edgesOut, remove, canvasParams };
}

