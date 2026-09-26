import { DEFS, HELPERS, fmtLiteral } from './nodes/defs.js';
import { expandInputs, getPortDefs, connectedInputs, inputValue } from './nodes/ports.js';

const RESERVED = new Set(
  `break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await async of
  window document p5 Math i k ang g hsbColor mixColors waveform formatValue setup draw color colorMode random
  millis frameCount deltaTime width height mouseX mouseY mouseIsPressed noise sin cos tan abs floor ceil round sqrt sq fract radians degrees pow min max atan2 map lerp constrain
  fill stroke noFill noStroke strokeWeight rect ellipse circle line beginShape vertex endShape background push pop translate rotate scale text textSize textAlign image createGraphics createCanvas resizeCanvas
  TWO_PI PI HALF_PI CENTER CORNER CLOSE LEFT RIGHT BASELINE RGB HSB`.split(/\s+/),
);

const PURE = ['number', 'boolean', 'trigger', 'color', 'vector'];

export const isReservedName = (name) => RESERVED.has(name);

function ident(name, extraReserved) {
  let s = name.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s || /^[0-9]/.test(s)) s = 'n' + s;
  if (RESERVED.has(s) || extraReserved.has(s)) s += '_';
  return s;
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** names declared in the user's globals block, so node variables never shadow them */
function declaredNames(src) {
  const out = new Set();
  const re = /\b(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

export function compile(nodes, edgesIn, live) {
  const errors = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const canvas = nodes.find((n) => n.type === 'canvas');
  const globalsText = String(canvas?.params?.globals ?? '').trim();
  const setupText = String(canvas?.params?.setup ?? '').trim();
  const extraReserved = declaredNames(globalsText + '\n' + setupText);
// valid, fully connected edges only; one incoming per input port
  const incoming = new Map();
  const outDeg = new Map();
  const validEdges = [];
  for (const e of edgesIn) {
    if (!e.from || !e.to) continue;
    const a = byId.get(e.from.node), b = byId.get(e.to.node);
    if (!a || !b || !DEFS[a.type] || !DEFS[b.type]) continue;
    if (!getPortDefs(a).outputs.some((p) => p.name === e.from .port)) continue;
    validEdges.push(e);
  }
  const usedOutputs = new Map();
  for (const e of validEdges) {
    let u = usedOutputs.get(e.from .node);
    if (!u) usedOutputs.set(e.from .node, (u = new Set()));
    u.add(e.from .port);
    let m = incoming.get(e.to .node);
    if (!m) incoming.set(e.to .node, (m = new Map()));
    m.set(e.to .port, e.from);
    let s = outDeg.get(e.from .node);
    if (!s) outDeg.set(e.from .node, (s = new Set()));
    s.add(e.to .node);
  }
// topological order (Kahn), canvas last among ties
  const indeg = new Map();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const [to, m] of incoming) indeg.set(to, new Set([...m.values()].map((f) => f.node)).size);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const to of outDeg.get(id) ?? []) {
      indeg.set(to, (indeg.get(to) ?? 1) - 1);
      if ((indeg.get(to) ?? 0) <= 0) queue.push(to);
    }
  }
  if (order.length < nodes.length) errors.push('Cycle detected: some nodes were skipped.');
  if (canvas && order.includes(canvas.id)) { order.splice(order.indexOf(canvas.id), 1); order.push(canvas.id); }
// variable names
  const varOf = new Map();
  const used = new Set();
  for (const id of order) {
    const n = byId.get(id);
    const base = ident(n.name || n.type, extraReserved);
    let name = base, k = 2;
    while (used.has(name)) name = `${base}${k++}`;
    used.add(name);
    varOf.set(id, name);
  }

  const globals = [];
  const setup = [];
  const helpers = new Set();
  const body = [];
  const drawFns = new Map();
  const probeKeys = [];
  const probeVars = [];
  const vars = {};
  const segments = {};

  for (const id of order) {
    const node = byId.get(id);
    const def = DEFS[node.type];
    if (!def) { errors.push(`Unknown node type ${node.type}`); continue; }
    const conn = connectedInputs(id, validEdges);
    const inputs = expandInputs(node, conn);
    const outputs = getPortDefs(node).outputs;
    const inc = incoming.get(id) ?? new Map();
    const name = varOf.get(id);
    const seg = { globals: [], setup: [], body: [] };
    segments[id] = seg;
    const vname = (port) => (outputs.length <= 1 || !port ? name : `${name}_${port}`);
    for (const o of outputs) vars[vname(o.name)] = { node: id, port: o.name };
    const srcVar = (src, inPortName) => {
      const sn = byId.get(src.node);
      const souts = getPortDefs(sn).outputs;
      const sname = varOf.get(src.node);
      const sport = souts.find((p) => p.name === src.port);
      const inPort = inputs.find((p) => p.name === inPortName);
      let expr = souts.length <= 1 ? sname : `${sname}_${src.port}`;
      if (sport && inPort) {
        if (sport.type === 'number' && inPort.type === 'boolean') expr = `(${expr} !== 0)`;
        else if ((sport.type === 'boolean' || sport.type === 'trigger') && inPort.type === 'number') expr = `(${expr} ? 1 : 0)`;
      }
      return expr;
    };
    const portDef = (p) => inputs.find((x) => x.name === p);

    const ctx = {
      node,
      gid: name,
      live,
      mainRef: 'p5.instance',
      connected: (p) => inc.has(p),
      isDefault: (p) => {
        if (inc.has(p)) return false;
        const d = portDef(p);
        if (!d) return true;
        const v = node.params?.[p];
        if (typeof v === 'string') return false;
        return v === undefined || deepEq(v, d.default);
      },
      in: (p) => {
        const src = inc.get(p);
        if (src) return srcVar(src, p);
        const d = portDef(p);
        if (!d) return 'null';
        return fmtLiteral(d.type, inputValue(node, d));
      },
      raw: (p) => {
        const d = portDef(p);
        return d ? inputValue(node, d) : node.params?.[p];
      },
      arg: (p) => {
        const src = inc.get(p);
        if (src) return srcVar(src, p);
        const d = portDef(p);
        if (!d) return 'null';
        const v = inputValue(node, d);
        if (typeof v === 'string' && d.type !== 'color') return v.trim() || '0';
        return fmtLiteral(d.type, v);
      },
      param: (p) => {
        const v = node.params?.[p];
        if (v !== undefined) return v;
        return def.params?.find((x) => x.name === p)?.default;
      },
      v: vname,
      drawIn: (p, T) => {
        const src = inc.get(p);
        if (!src) return [];
        const fn = drawFns.get(src.node);
        return fn ? fn(T) : [];
      },
      drawInputs: (prefix, T) => {
        const lines = [];
        for (const p of inputs) {
          if (!p.name.startsWith(prefix) || p.type !== 'draw') continue;
          const src = inc.get(p.name);
          if (!src) continue;
          const fn = drawFns.get(src.node);
          if (fn) lines.push(...fn(T));
        }
        return lines;
      },
      addGlobal: (l) => { globals.push(l); seg.globals.push(l); },
      addSetup: (l) => { setup.push(l); seg.setup.push(l); },
      helper: (h) => helpers.add(h),
    };

    let res;
    try {
      res = def.compile(ctx);
    } catch (e) {
      errors.push(`${name}: ${e?.message ?? e}`);
      continue;
    }
    const lines = [];
    if (res.pre) lines.push(...res.pre);
    const usedO = usedOutputs.get(id);
    if (res.values) {
      for (const [port, expr] of Object.entries(res.values)) {
        if (!live && !usedO?.has(port) && outputs.length > 1) continue; // skip unused outputs in the export
        lines.push(`const ${vname(port)} = ${expr};`);
      }
    }
    if (res.stmts) lines.push(...res.stmts);
    if (res.draw) drawFns.set(id, res.draw);
    seg.body = lines;
    body.push(...lines);
    if (live) {
      for (const o of outputs) {
        if (!PURE.includes(o.type)) continue;
        if (!res.values?.[o.name] && !res.pre?.some((l) => l.includes(`const ${vname(o.name)} `))) continue;
        probeKeys.push(`${id}|${o.name}`);
        probeVars.push(vname(o.name));
      }
    }
  }

  const indent = (ls, pad = '  ') => ls.flatMap((l) => l.split('\n')).map((l) => (l ? pad + l : l));

  const out = [];
  for (const h of helpers) out.push(HELPERS[h], '');
  if (globals.length) out.push(...globals, '');
  if (globalsText) out.push(globalsText, '');
  out.push('function setup() {');
  setup.sort((a, b) => Number(/^(createCanvas|__canvas)\(/.test(b)) - Number(/^(createCanvas|__canvas)\(/.test(a)));
  out.push(...indent(setup));
  if (setupText) out.push(...indent(setupText.split('\n')));
  out.push('}', '');
  out.push('function draw() {');
  out.push(...indent(body));
  if (live && probeKeys.length) {
    out.push('  __probe({');
    out.push(...probeKeys.map((k, i) => `    ${JSON.stringify(k)}: ${probeVars[i]},`));
    out.push('  });');
  }
  out.push('}');
  const nodeVar = {};
  for (const [id, v] of varOf) nodeVar[id] = v;
  return { code: out.join('\n'), errors, probeKeys, vars, segments, nodeVar };
}

/** would connecting from -> to create a cycle? */
export function createsCycle(edges, fromNode, toNode) {
  if (fromNode === toNode) return true;
  const adj = new Map();
  for (const e of edges) {
    if (!e.from || !e.to) continue;
    let a = adj.get(e.from.node);
    if (!a) adj.set(e.from.node, (a = []));
    a.push(e.to.node);
  }
  const stack = [toNode];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (n === fromNode) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adj.get(n) ?? []) stack.push(m);
  }
  return false;
}
