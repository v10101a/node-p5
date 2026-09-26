import type { NodeDef, PortDef, CompileCtx } from '../types';

// ---------- port helpers ----------
const num = (name: string, def = 0, extra: Partial<PortDef> = {}): PortDef => ({
  name, type: 'number', default: def, widget: 'number', ...extra,
});
const col = (name: string, def: [number, number, number, number] | null, extra: Partial<PortDef> = {}): PortDef => ({
  name, type: 'color', default: def, widget: 'color', ...extra,
});
const bool = (name: string, def = false): PortDef => ({ name, type: 'boolean', default: def, widget: 'bool' });
const trig = (name: string): PortDef => ({ name, type: 'trigger', default: false, widget: 'none' });
const vec = (name: string): PortDef => ({ name, type: 'vector', default: { x: 0, y: 0 }, widget: 'vector' });
const drawIn: PortDef = { name: 'draw', type: 'draw', variadic: true };
const drawOut: PortDef = { name: 'out', type: 'draw', label: 'draw' };
const out = (name: string, type: PortDef['type'], label?: string): PortDef => ({ name, type, label });

const styleIn = [col('fill', [255, 110, 90, 255]), col('stroke', null), num('weight', 1, { min: 0, max: 40, step: 0.5 })];

/** the argument list for fill()/stroke()/background(): `220`, `255, 0, 0`, an expression, or a variable. null = none */
export function colorArgs(c: CompileCtx, port: string): string | null {
  if (c.connected(port)) return c.in(port);
  const v = c.raw(port);
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    const [r, g, b, a] = v.map((x: number) => Math.round(x));
    const rgb = r === g && g === b ? `${r}` : `${r}, ${g}, ${b}`;
    return a === undefined || a === 255 ? rgb : `${rgb}, ${a}`;
  }
  return null;
}

function styleLines(c: CompileCtx, T: string, opts: { fill?: boolean; stroke?: boolean } = {}): string[] {
  const lines: string[] = [];
  if (opts.fill !== false) {
    const f = colorArgs(c, 'fill');
    lines.push(f === null ? `${T}noFill();` : `${T}fill(${f});`);
  }
  if (opts.stroke !== false) {
    const s = colorArgs(c, 'stroke');
    if (s === null) lines.push(`${T}noStroke();`);
    else {
      lines.push(`${T}stroke(${s});`);
      lines.push(`${T}strokeWeight(${c.in('weight')});`);
    }
  }
  return lines;
}

const timeExpr = (c: CompileCtx) => (c.connected('t') ? c.in('t') : 'millis() / 1000');
const int = (c: CompileCtx, port: string) => {
  if (c.connected(port) || typeof c.raw(port) === 'string') return `Math.round(${c.in(port)})`;
  return String(Math.round(Number(c.raw(port) ?? 0)));
};

// ---------- helpers emitted into the sketch when used ----------
export const HELPERS: Record<string, string> = {
  hsb: `function hsbColor(h, s, b, a = 255) {
  h = ((h % 360) + 360) % 360; s = constrain(s, 0, 100) / 100; b = constrain(b, 0, 100) / 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [f(5) * 255, f(3) * 255, f(1) * 255, a];
}`,
  mix: `function mixColors(c1, c2, t) {
  if (!c1) return c2; if (!c2) return c1;
  t = constrain(t, 0, 1);
  const a = [c1[0], c1[1], c1[2], c1[3] ?? 255], b = [c2[0], c2[1], c2[2], c2[3] ?? 255];
  return a.map((v, i) => v + (b[i] - v) * t);
}`,
  wave: `function waveform(shape, x) {
  x = x - Math.floor(x);
  if (shape === 'triangle') return 1 - Math.abs(x * 4 - 2);
  if (shape === 'saw') return x * 2 - 1;
  if (shape === 'square') return x < 0.5 ? 1 : -1;
  return Math.sin(x * TWO_PI);
}`,
  fmt: `function formatValue(v) {
  return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
}`,
};

// ---------- the library ----------
export const NODE_DEFS: NodeDef[] = [
  // ===== inputs =====
  {
    type: 'number', label: 'Number', category: 'input', description: 'A constant with a slider.',
    inputs: [], outputs: [out('out', 'number')],
    params: [
      { name: 'value', widget: 'number', default: 50 },
      { name: 'min', widget: 'number', default: 0 },
      { name: 'max', widget: 'number', default: 100 },
    ],
    compile: (c) => ({ values: { out: fmtNum(c.param('value') ?? 0) } }),
  },
  {
    type: 'color', label: 'Color', category: 'input', description: 'A constant color.',
    inputs: [], outputs: [out('out', 'color')],
    params: [{ name: 'value', widget: 'color', default: [80, 160, 255, 255] }],
    compile: (c) => ({ values: { out: fmtColor(c.param('value')) } }),
  },
  {
    type: 'vector', label: 'Vector', category: 'input', description: 'Make a 2D vector from x and y.',
    inputs: [num('x', 0), num('y', 0)], outputs: [out('out', 'vector')],
    compile: (c) => ({ values: { out: `{ x: ${c.in('x')}, y: ${c.in('y')} }` } }),
  },
  {
    type: 'time', label: 'Time', category: 'input', description: 'Seconds since start, frame count, delta time.',
    inputs: [], outputs: [out('seconds', 'number'), out('frame', 'number'), out('delta', 'number')],
    compile: () => ({ values: { seconds: 'millis() / 1000', frame: 'frameCount', delta: 'deltaTime / 1000' } }),
  },
  {
    type: 'size', label: 'Canvas size', category: 'input', description: 'Width and height of the sketch canvas.',
    inputs: [], outputs: [out('width', 'number'), out('height', 'number'), out('center', 'vector')],
    compile: () => ({ values: { width: 'width', height: 'height', center: '{ x: width / 2, y: height / 2 }' } }),
  },
  {
    type: 'mouse', label: 'Mouse', category: 'input', description: 'Mouse position, button state, click trigger.',
    inputs: [], outputs: [out('x', 'number'), out('y', 'number'), out('pos', 'vector'), out('down', 'boolean'), out('click', 'trigger')],
    compile: (c) => {
      c.addGlobal(`let ${c.gid}_wasDown = false;`);
      return {
        pre: [`const ${c.v('click')} = mouseIsPressed && !${c.gid}_wasDown;`, `${c.gid}_wasDown = mouseIsPressed;`],
        values: { x: 'mouseX', y: 'mouseY', pos: '{ x: mouseX, y: mouseY }', down: 'mouseIsPressed' },
      };
    },
  },
  {
    type: 'noise', label: 'Noise', category: 'input', description: 'Perlin noise, 0..1.',
    inputs: [num('x', 0, { step: 0.01 }), num('y', 0, { step: 0.01 }), num('z', 0, { step: 0.01 })],
    outputs: [out('out', 'number')],
    compile: (c) => {
      const args = [c.in('x')];
      if (!c.isDefault('y') || !c.isDefault('z')) args.push(c.in('y'));
      if (!c.isDefault('z')) args.push(c.in('z'));
      return { values: { out: `noise(${args.join(', ')})` } };
    },
  },
  {
    type: 'osc', label: 'Oscillator', category: 'input', description: 'A wave over time. -1..1 scaled by amp, plus offset.',
    inputs: [
      { name: 't', type: 'number', widget: 'none', label: 'time (auto)' },
      num('freq', 0.5, { step: 0.05, min: 0 }), num('amp', 100), num('offset', 0), num('phase', 0, { step: 0.05 }),
    ],
    outputs: [out('out', 'number')],
    params: [{ name: 'shape', widget: 'select', options: ['sine', 'triangle', 'saw', 'square'], default: 'sine' }],
    compile: (c) => {
      const x = `${timeExpr(c)} * ${c.in('freq')}${c.isDefault('phase') ? '' : ` + ${c.in('phase')}`}`;
      const shape = c.param('shape') ?? 'sine';
      let w: string;
      if (shape === 'sine') w = `sin((${x}) * TWO_PI)`;
      else { c.helper('wave'); w = `waveform('${shape}', ${x})`; }
      const amp = c.in('amp') === '1' ? w : `${w} * ${c.in('amp')}`;
      return { values: { out: c.isDefault('offset') ? amp : `${amp} + ${c.in('offset')}` } };
    },
  },
  {
    type: 'metro', label: 'Metro', category: 'input', description: 'Fires a trigger every N seconds.',
    inputs: [num('interval', 1, { min: 0.01, step: 0.05 })], outputs: [out('tick', 'trigger')],
    compile: (c) => {
      c.addGlobal(`let ${c.gid}_last = 0;`);
      return { pre: [`const ${c.v('tick')} = millis() - ${c.gid}_last >= ${c.in('interval')} * 1000;`, `if (${c.v('tick')}) ${c.gid}_last = millis();`] };
    },
  },

  // ===== math =====
  {
    type: 'math', label: 'Math', category: 'math', description: 'a (op) b',
    inputs: [num('a', 0), num('b', 1)], outputs: [out('out', 'number')],
    params: [{ name: 'op', widget: 'select', options: ['+', '-', '×', '÷', '%', 'pow', 'min', 'max', 'atan2'], default: '+' }],
    compile: (c) => {
      const a = c.in('a'), b = c.in('b'), op = c.param('op') ?? '+';
      const e: Record<string, string> = {
        '+': `${a} + ${b}`, '-': `${a} - ${b}`, '×': `${a} * ${b}`, '÷': `${a} / ${b}`, '%': `${a} % ${b}`,
        pow: `pow(${a}, ${b})`, min: `min(${a}, ${b})`, max: `max(${a}, ${b})`, atan2: `atan2(${a}, ${b})`,
      };
      return { values: { out: e[op] ?? e['+'] } };
    },
  },
  {
    type: 'fn', label: 'Function', category: 'math', description: 'f(a)',
    inputs: [num('a', 0)], outputs: [out('out', 'number')],
    params: [{ name: 'fn', widget: 'select', options: ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'sq', 'fract', 'sign', 'negate', 'radians', 'degrees'], default: 'sin' }],
    compile: (c) => {
      const a = c.in('a'), f = c.param('fn') ?? 'sin';
      const e: Record<string, string> = { sign: `Math.sign(${a})`, negate: `-(${a})` };
      return { values: { out: e[f] ?? `${f}(${a})` } };
    },
  },
  {
    type: 'map', label: 'Map', category: 'math', description: 'Re-map a number from one range to another.',
    inputs: [num('value', 0), num('inMin', 0), num('inMax', 1), num('outMin', 0), num('outMax', 100), bool('clamp', false)],
    outputs: [out('out', 'number')],
    compile: (c) => ({
      values: { out: `map(${c.in('value')}, ${c.in('inMin')}, ${c.in('inMax')}, ${c.in('outMin')}, ${c.in('outMax')}${c.isDefault('clamp') ? '' : ', ' + c.in('clamp')})` },
    }),
  },
  {
    type: 'lerp', label: 'Lerp', category: 'math', description: 'Blend between a and b by t.',
    inputs: [num('a', 0), num('b', 100), num('t', 0.5, { min: 0, max: 1, step: 0.01 })], outputs: [out('out', 'number')],
    compile: (c) => ({ values: { out: `lerp(${c.in('a')}, ${c.in('b')}, ${c.in('t')})` } }),
  },
  {
    type: 'smooth', label: 'Smooth', category: 'math', description: 'Ease toward the input over time.',
    inputs: [num('value', 0), num('amount', 0.1, { min: 0.001, max: 1, step: 0.01 })], outputs: [out('out', 'number')],
    compile: (c) => {
      c.addGlobal(`let ${c.gid}_s = 0;`);
      return { pre: [`${c.gid}_s = lerp(${c.gid}_s, ${c.in('value')}, ${c.in('amount')});`], values: { out: `${c.gid}_s` } };
    },
  },
  {
    type: 'compare', label: 'Compare', category: 'math', description: 'a (op) b → true/false',
    inputs: [num('a', 0), num('b', 0)], outputs: [out('out', 'boolean')],
    params: [{ name: 'op', widget: 'select', options: ['<', '>', '≤', '≥', '=', '≠'], default: '<' }],
    compile: (c) => {
      const ops: Record<string, string> = { '<': '<', '>': '>', '≤': '<=', '≥': '>=', '=': '===', '≠': '!==' };
      return { values: { out: `${c.in('a')} ${ops[c.param('op') ?? '<']} ${c.in('b')}` } };
    },
  },
  {
    type: 'switch', label: 'Switch', category: 'math', description: 'Pick a when on, else b.',
    inputs: [bool('on', false), num('a', 1), num('b', 0)], outputs: [out('out', 'number')],
    compile: (c) => ({ values: { out: `(${c.in('on')} ? ${c.in('a')} : ${c.in('b')})` } }),
  },
  {
    type: 'expr', label: 'Expression', category: 'math', description: 'Any p5 expression, e.g. mouseX / width or sin(frameCount * 0.05) * 20.',
    inputs: [], outputs: [out('out', 'number')],
    params: [
      { name: 'expr', widget: 'text', default: 'mouseX / width' },
      { name: 'kind', widget: 'select', options: ['number', 'color', 'vector', 'boolean'], default: 'number' },
    ],
    width: 220,
    compile: (c) => {
      const outs = c.node.ports?.outputs ?? [{ name: 'out' }];
      const e = String(c.param('expr') ?? '').trim() || '0';
      return { values: { [outs[0]?.name ?? 'out']: e } };
    },
  },
  {
    type: 'counter', label: 'Counter', category: 'math', description: 'Counts triggers.',
    inputs: [trig('trigger'), num('step', 1), trig('reset')], outputs: [out('count', 'number')],
    compile: (c) => {
      c.addGlobal(`let ${c.gid}_n = 0;`);
      const pre: string[] = [];
      if (c.connected('reset')) pre.push(`if (${c.in('reset')}) ${c.gid}_n = 0;`);
      pre.push(`if (${c.in('trigger')}) ${c.gid}_n += ${c.in('step')};`);
      return { pre, values: { count: `${c.gid}_n` } };
    },
  },
  {
    type: 'toggle', label: 'Toggle', category: 'math', description: 'Flips on each trigger.',
    inputs: [trig('trigger')], outputs: [out('out', 'boolean')],
    compile: (c) => {
      c.addGlobal(`let ${c.gid}_on = false;`);
      return { pre: [`if (${c.in('trigger')}) ${c.gid}_on = !${c.gid}_on;`], values: { out: `${c.gid}_on` } };
    },
  },
  {
    type: 'split', label: 'Split vector', category: 'math', description: 'Vector → x, y',
    inputs: [vec('vec')], outputs: [out('x', 'number'), out('y', 'number')],
    compile: (c) => ({ values: { x: `${c.in('vec')}.x`, y: `${c.in('vec')}.y` } }),
  },

  // ===== color =====
  {
    type: 'hsb', label: 'HSB color', category: 'color', description: 'Hue 0–360, saturation & brightness 0–100.',
    inputs: [num('h', 200, { min: 0, max: 360 }), num('s', 80, { min: 0, max: 100 }), num('b', 100, { min: 0, max: 100 }), num('a', 255, { min: 0, max: 255 })],
    outputs: [out('out', 'color')],
    compile: (c) => { c.helper('hsb'); return { values: { out: `hsbColor(${c.in('h')}, ${c.in('s')}, ${c.in('b')}${c.isDefault('a') ? '' : ', ' + c.in('a')})` } }; },
  },
  {
    type: 'rgb', label: 'RGB color', category: 'color', description: 'Red, green, blue, alpha 0–255.',
    inputs: [num('r', 255, { min: 0, max: 255 }), num('g', 120, { min: 0, max: 255 }), num('b', 80, { min: 0, max: 255 }), num('a', 255, { min: 0, max: 255 })],
    outputs: [out('out', 'color')],
    compile: (c) => ({ values: { out: `[${c.in('r')}, ${c.in('g')}, ${c.in('b')}, ${c.in('a')}]` } }),
  },
  {
    type: 'mix', label: 'Mix colors', category: 'color', description: 'Blend two colors by t.',
    inputs: [col('a', [255, 110, 90, 255]), col('b', [80, 160, 255, 255]), num('t', 0.5, { min: 0, max: 1, step: 0.01 })],
    outputs: [out('out', 'color')],
    compile: (c) => { c.helper('mix'); return { values: { out: `mixColors(${c.in('a')}, ${c.in('b')}, ${c.in('t')})` } }; },
  },

  // ===== draw =====
  {
    type: 'background', label: 'Background', category: 'draw', description: 'Fill the whole canvas with a color.',
    inputs: [col('color', [250, 246, 238, 255])], outputs: [drawOut],
    compile: (c) => ({ draw: (T) => { const col = colorArgs(c, 'color'); return col === null ? [] : [`${T}background(${col});`]; } }),
  },
  {
    type: 'rect', label: 'Rectangle', category: 'draw',
    inputs: [num('x', 100), num('y', 100), num('w', 120), num('h', 80), num('radius', 0, { min: 0 }), ...styleIn], outputs: [drawOut],
    params: [{ name: 'mode', widget: 'select', options: ['corner', 'center'], default: 'corner' }],
    compile: (c) => ({
      draw: (T) => {
        const center = c.param('mode') === 'center';
        const r = c.isDefault('radius') ? '' : `, ${c.arg('radius')}`;
        return [
          ...styleLines(c, T),
          ...(center ? [`${T}rectMode(CENTER);`] : []),
          `${T}rect(${c.arg('x')}, ${c.arg('y')}, ${c.arg('w')}, ${c.arg('h')}${r});`,
          ...(center ? [`${T}rectMode(CORNER);`] : []),
        ];
      },
    }),
  },
  {
    type: 'ellipse', label: 'Ellipse', category: 'draw',
    inputs: [num('x', 200), num('y', 200), num('w', 80), num('h', 80), ...styleIn], outputs: [drawOut],
    compile: (c) => ({ draw: (T) => [...styleLines(c, T), `${T}ellipse(${c.arg('x')}, ${c.arg('y')}, ${c.arg('w')}, ${c.arg('h')});`] }),
  },
  {
    type: 'circle', label: 'Circle', category: 'draw',
    inputs: [num('x', 200), num('y', 200), num('d', 80, { min: 0 }), ...styleIn], outputs: [drawOut],
    compile: (c) => ({ draw: (T) => [...styleLines(c, T), `${T}circle(${c.arg('x')}, ${c.arg('y')}, ${c.arg('d')});`] }),
  },
  {
    type: 'line', label: 'Line', category: 'draw',
    inputs: [num('x1', 50), num('y1', 50), num('x2', 250), num('y2', 150), col('stroke', [40, 40, 46, 255]), num('weight', 2, { min: 0, max: 40, step: 0.5 })],
    outputs: [drawOut],
    compile: (c) => ({ draw: (T) => [...styleLines(c, T, { fill: false }), `${T}line(${c.arg('x1')}, ${c.arg('y1')}, ${c.arg('x2')}, ${c.arg('y2')});`] }),
  },
  {
    type: 'polygon', label: 'Polygon', category: 'draw', description: 'Regular polygon with n sides.',
    inputs: [num('x', 200), num('y', 200), num('radius', 60), num('sides', 6, { min: 3, max: 64, step: 1 }), num('rotation', 0, { step: 0.05 }), ...styleIn],
    outputs: [drawOut],
    compile: (c) => ({
      draw: (T) => {
        const n = int(c, 'sides');
        const rot = c.isDefault('rotation') ? '' : `${c.in('rotation')} + `;
        return [
          ...styleLines(c, T),
          `${T}beginShape();`,
          `for (let k = 0; k < ${n}; k++) {`,
          `  const ang = ${rot}TWO_PI * k / ${n};`,
          `  ${T}vertex(${c.in('x')} + cos(ang) * ${c.in('radius')}, ${c.in('y')} + sin(ang) * ${c.in('radius')});`,
          `}`,
          `${T}endShape(CLOSE);`,
        ];
      },
    }),
  },
  {
    type: 'text', label: 'Text', category: 'draw', description: 'Draw text. Connect a value to display it live.',
    inputs: [num('x', 40), num('y', 40), num('size', 24, { min: 1 }), { name: 'value', type: 'number', widget: 'none', label: 'value (optional)' }, col('fill', [40, 40, 46, 255])],
    outputs: [drawOut],
    params: [
      { name: 'text', widget: 'text', default: 'hello' },
      { name: 'align', widget: 'select', options: ['left', 'center', 'right'], default: 'left' },
    ],
    width: 220,
    compile: (c) => ({
      draw: (T) => {
        const align = c.param('align') ?? 'left';
        let content = JSON.stringify(String(c.param('text') ?? ''));
        if (c.connected('value')) { c.helper('fmt'); content = content === '""' ? `formatValue(${c.in('value')})` : `${content} + ' ' + formatValue(${c.in('value')})`; }
        return [
          ...styleLines(c, T, { stroke: false }), `${T}noStroke();`,
          `${T}textSize(${c.arg('size')});`,
          `${T}textAlign(${align.toUpperCase()}, BASELINE);`,
          `${T}text(${content}, ${c.arg('x')}, ${c.arg('y')});`,
        ];
      },
    }),
  },
  {
    type: 'image', label: 'Image', category: 'draw', description: 'Draw an image (from a Render node).',
    inputs: [{ name: 'img', type: 'image', widget: 'none' }, num('x', 0), num('y', 0), num('w', 0), num('h', 0)], outputs: [drawOut],
    compile: (c) => ({
      draw: (T) => {
        if (!c.connected('img') && typeof c.raw('img') !== 'string') return [];
        const img = c.arg('img');
        const w = c.isDefault('w') ? `${img}.width` : c.arg('w');
        const h = c.isDefault('h') ? `${img}.height` : c.arg('h');
        return [`${T}image(${img}, ${c.arg('x')}, ${c.arg('y')}, ${w}, ${h});`];
      },
    }),
  },

  // ===== compose =====
  {
    type: 'layers', label: 'Layers', category: 'compose', description: 'Stack drawings in order, top port first.',
    inputs: [drawIn], outputs: [drawOut],
    compile: (c) => ({ draw: (T) => c.drawInputs('draw', T) }),
  },
  {
    type: 'transform', label: 'Transform', category: 'compose', description: 'Translate / rotate / scale everything inside.',
    inputs: [drawIn, num('x', 0), num('y', 0), num('rotate', 0, { step: 0.02 }), num('scale', 1, { step: 0.02 })], outputs: [drawOut],
    compile: (c) => ({
      draw: (T) => {
        const inner = c.drawInputs('draw', T);
        if (!inner.length) return [];
        const lines = [`${T}push();`];
        if (!(c.isDefault('x') && c.isDefault('y'))) lines.push(`${T}translate(${c.arg('x')}, ${c.arg('y')});`);
        if (!c.isDefault('rotate')) lines.push(`${T}rotate(${c.arg('rotate')});`);
        if (!c.isDefault('scale')) lines.push(`${T}scale(${c.arg('scale')});`);
        return [...lines, ...inner, `${T}pop();`];
      },
    }),
  },
  {
    type: 'repeat', label: 'Repeat', category: 'compose', description: 'Draw the inside N times, transforming a bit more each time.',
    inputs: [drawIn, num('count', 8, { min: 1, max: 500, step: 1 }), num('x', 30), num('y', 0), num('rotate', 0, { step: 0.02 }), num('scale', 1, { step: 0.01 })],
    outputs: [drawOut],
    params: [{ name: 'mode', widget: 'select', options: ['linear', 'radial'], default: 'linear' }],
    compile: (c) => ({
      draw: (T) => {
        const inner = c.drawInputs('draw', T);
        if (!inner.length) return [];
        const n = int(c, 'count');
        const radial = c.param('mode') === 'radial';
        const step: string[] = [];
        if (radial) step.push(`${T}rotate(TWO_PI / ${n});`);
        else {
          if (!(c.isDefault('x') && c.isDefault('y'))) step.push(`${T}translate(${c.arg('x')}, ${c.arg('y')});`);
          if (!c.isDefault('rotate')) step.push(`${T}rotate(${c.arg('rotate')});`);
        }
        if (!c.isDefault('scale')) step.push(`${T}scale(${c.arg('scale')});`);
        return [`${T}push();`, `for (let i = 0; i < ${n}; i++) {`, ...inner.map((l) => '  ' + l), ...step.map((l) => '  ' + l), `}`, `${T}pop();`];
      },
    }),
  },
  {
    type: 'render', label: 'Render to image', category: 'compose', description: 'Draw into an offscreen buffer and output it as an image.',
    inputs: [drawIn, num('w', 300, { min: 1 }), num('h', 300, { min: 1 }), bool('clear', true)], outputs: [out('out', 'image', 'image')],
    compile: (c) => {
      const v = c.v('out');
      c.addGlobal(`let ${v};`);
      c.addSetup(`${v} = createGraphics(${c.in('w')}, ${c.in('h')});`);
      const stmts: string[] = [];
      if (c.connected('w') || c.connected('h')) {
        stmts.push(`if (${v}.width !== Math.round(${c.in('w')}) || ${v}.height !== Math.round(${c.in('h')})) { ${v}.remove(); ${v} = createGraphics(${c.in('w')}, ${c.in('h')}); }`);
      }
      if (c.in('clear') !== 'false') stmts.push(`${v}.clear();`);
      stmts.push(...c.drawInputs('draw', `${v}.`));
      return { stmts };
    },
  },

  // ===== custom =====
  {
    type: 'code', label: 'Code', category: 'custom', description: 'A JS function of the inputs. Return the output value.',
    inputs: [], outputs: [],
    params: [
      { name: 'ports', widget: 'ports', default: { inputs: [num('a', 0), num('b', 0)], outputs: [out('out', 'number')] } },
      { name: 'code', widget: 'code', default: 'return a + b;' },
    ],
    width: 260,
    compile: (c) => {
      const ins = c.node.ports?.inputs ?? [];
      const outs = c.node.ports?.outputs ?? [];
      const body = String(c.param('code') ?? '').split('\n').map((l) => '  ' + l).join('\n');
      const call = `((${ins.map((p) => p.name).join(', ')}) => {\n${body}\n})(${ins.map((p) => c.in(p.name)).join(', ')})`;
      if (outs.length === 1) return { values: { [outs[0].name]: call } };
      const values: Record<string, string> = {};
      for (const o of outs) values[o.name] = `${c.gid}_r.${o.name}`;
      return { pre: [`const ${c.gid}_r = ${call} || {};`], values };
    },
  },
  {
    type: 'drawcode', label: 'Code block', category: 'custom', description: 'Any p5 statements, run at this point in draw order.',
    inputs: [], outputs: [drawOut],
    params: [{ name: 'code', widget: 'code', default: 'fill(255, 110, 90);\nnoStroke();\ncircle(mouseX, mouseY, 60);' }],
    width: 260,
    compile: (c) => ({
      draw: () => {
        const body = String(c.param('code') ?? '').trim();
        return body ? body.split('\n') : [];
      },
    }),
  },

  // ===== output =====
  {
    type: 'canvas', label: 'Canvas', category: 'output', description: 'The sketch. Drawings connected here are drawn in port order.',
    inputs: [drawIn], outputs: [],
    params: [
      { name: 'width', widget: 'number', default: 600 },
      { name: 'height', widget: 'number', default: 400 },
      { name: 'globals', label: 'globals', widget: 'code', default: '' },
      { name: 'setup', label: 'setup', widget: 'code', default: '' },
    ],
    singleton: true,
    compile: (c) => {
      const dim = (k: string, d: number) => { const v = c.param(k) ?? d; return typeof v === 'string' ? v : String(Math.round(Number(v))); };
      c.addSetup(`${c.live ? '__canvas' : 'createCanvas'}(${dim('width', 600)}, ${dim('height', 400)});`);
      return { stmts: c.drawInputs('draw', '') };
    },
  },
];

export const DEFS: Record<string, NodeDef> = Object.fromEntries(NODE_DEFS.map((d) => [d.type, d]));

// ---------- literal formatting ----------
export function fmtNum(n: any): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const s = Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(3) : String(Math.round(v * 10000) / 10000);
  return v < 0 ? `(${s})` : s;
}
export function fmtColor(c: any): string {
  if (!c) return 'null';
  const [r, g, b, a] = c;
  return a === 255 || a === undefined ? `[${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}]` : `[${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a)}]`;
}
/** an inline expression, parenthesised unless it is a single token/call */
export function wrapExpr(s: string): string {
  const t = s.trim();
  if (!t) return '0';
  if (/^-?[\d.]+(e[+-]?\d+)?$/i.test(t) || /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(t)) return t;
  // single balanced call / array / object / paren group
  const m = /^([A-Za-z_$][\w$.]*)?([(\[{])/.exec(t);
  if (m) {
    const open = m[2], close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0, ok = true;
    for (let i = m[0].length - 1; i < t.length; i++) {
      const ch = t[i];
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0 && i !== t.length - 1) { ok = false; break; } }
    }
    if (ok && depth === 0) return t;
  }
  return `(${t})`;
}
export function fmtLiteral(type: string, v: any): string {
  if (typeof v === 'string') {
    if (type === 'color') return v.includes(',') ? `[${v.trim()}]` : wrapExpr(v);
    return wrapExpr(v);
  }
  switch (type) {
    case 'number': return fmtNum(v ?? 0);
    case 'boolean': case 'trigger': return v ? 'true' : 'false';
    case 'color': return fmtColor(v);
    case 'vector': return `{ x: ${fmtNum(v?.x ?? 0)}, y: ${fmtNum(v?.y ?? 0)} }`;
    default: return 'null';
  }
}
