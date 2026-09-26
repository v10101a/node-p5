import React, { useEffect, useRef, useState } from 'react';
import type { PortDef, PortType } from '../types';
import { TYPE_COLORS } from '../types';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 100) return v.toFixed(1).replace(/\.0$/, '');
  return String(Math.round(v * 100) / 100);
}

/** a number, or a small expression string like `mouseX / 2` */
export function NumberField({ value, onChange, min, max, step, width }: { value: number | string; onChange: (v: number | string) => void; min?: number; max?: number; step?: number; width?: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const isExpr = typeof value === 'string';

  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (isExpr) { setText(String(value)); setEditing(true); return; }
    drag.current = { x: e.clientX, v: Number(value), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const s = (step ?? (Math.abs(d.v) < 2 && step === undefined ? 0.01 : 1)) * (e.shiftKey ? 10 : 1) * (e.altKey ? 0.1 : 1);
    const raw = d.v + dx * s * 0.5;
    const rounded = s >= 1 ? Math.round(raw) : Math.round(raw / s) * s;
    onChange(clamp(Number(rounded.toFixed(4))));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (d && !d.moved) { setText(String(value)); setEditing(true); }
  };
  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t === '') return;
    const v = Number(t);
    if (Number.isFinite(v)) onChange(clamp(v));
    else onChange(t); // an expression
  };
  if (editing) {
    return (
      <input ref={ref} className={'numfield editing' + (isExpr ? ' expr' : '')} data-widget value={text} style={{ width: isExpr ? Math.max(width ?? 60, 120) : width }} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation(); }} onPointerDown={stop} />
    );
  }
  if (isExpr) {
    return (
      <div className="numfield expr" data-widget style={{ width: Math.max(width ?? 60, 60) }} onPointerDown={onDown} onDoubleClick={stop} title={`ƒ ${value} — click to edit`}>
        <span className="fx">ƒ</span>{value}
      </div>
    );
  }
  return (
    <div className="numfield" data-widget style={{ width }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={stop} title="drag to change, click to type a number or an expression">
      {fmt(Number(value))}
    </div>
  );
}

export function SliderField({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input type="range" className="slider" data-widget min={min} max={max} step={(max - min) / 200 || 0.01} value={value}
      onChange={(e) => onChange(Number(e.target.value))} onPointerDown={stop} onDoubleClick={stop} />
  );
}

function toHex(c: number[] | null): string {
  if (!c) return '#000000';
  return '#' + [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function fromHex(h: string, alpha = 255): [number, number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), alpha];
}
export function colorCss(c: any): string {
  if (!c || !Array.isArray(c)) return 'transparent';
  const a = c[3] === undefined ? 1 : c[3] / 255;
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
}

/** a color: [r,g,b,a], null (none), or an expression string of fill() arguments like `num % 255, 500, 50` */
export function ColorField({ value, onChange, nullable }: { value: number[] | null | string; onChange: (v: number[] | null | string) => void; nullable?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (!t) return;
    const parts = t.split(',').map((x) => Number(x.trim()));
    if (parts.every((n) => Number.isFinite(n)) && (parts.length === 1 || parts.length === 3 || parts.length === 4)) {
      const [r, g, b, a] = parts.length === 1 ? [parts[0], parts[0], parts[0], 255] : [parts[0], parts[1], parts[2], parts[3] ?? 255];
      onChange([r, g, b, a]);
    } else onChange(t);
  };
  if (editing) {
    return <input ref={ref} className="numfield editing expr" data-widget value={text} style={{ width: 130 }} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation(); }} onPointerDown={stop} />;
  }
  const isExpr = typeof value === 'string';
  const arr = Array.isArray(value) ? value : null;
  return (
    <span className="colorfield" data-widget onPointerDown={stop} onDoubleClick={stop}>
      {isExpr ? (
        <span className="numfield expr" style={{ width: 96 }} title={`ƒ ${value} — click to edit`} onClick={() => { setText(value as string); setEditing(true); }}><span className="fx">ƒ</span>{value}</span>
      ) : (
        <label className={'swatch' + (arr ? '' : ' none')} style={{ background: arr ? colorCss(arr) : undefined }} title={arr ? toHex(arr) : 'none'}>
          <input type="color" value={toHex(arr)} onChange={(e) => onChange(fromHex(e.target.value, arr?.[3] ?? 255))} />
        </label>
      )}
      {nullable && (
        <button className={'nonebtn' + (value ? '' : ' active')} title={value ? 'set to none' : 'set a color'} onClick={() => onChange(value ? null : [40, 40, 46, 255])}>∅</button>
      )}
      {!isExpr && <button className="nonebtn" title="type r, g, b or an expression" onClick={() => { setText(arr ? arr.slice(0, 3).map(Math.round).join(', ') : ''); setEditing(true); }}>ƒ</button>}
    </span>
  );
}

export function BoolField({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={'boolfield' + (value ? ' on' : '')} data-widget onPointerDown={stop} onDoubleClick={stop} onClick={() => onChange(!value)}>
      <span className="knob" />
    </button>
  );
}

export function VectorField({ value, onChange }: { value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  const v = value ?? { x: 0, y: 0 };
  return (
    <span className="vecfield">
      <NumberField value={v.x} width={40} onChange={(x) => onChange({ ...v, x: x as number })} />
      <NumberField value={v.y} width={40} onChange={(y) => onChange({ ...v, y: y as number })} />
    </span>
  );
}

export function SelectField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select className="selectfield" data-widget value={value} onChange={(e) => onChange(e.target.value)} onPointerDown={stop} onDoubleClick={stop}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input className="textfield" data-widget value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      onPointerDown={stop} onDoubleClick={stop} onKeyDown={stop} />
  );
}

export function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(320, Math.max(64, el.scrollHeight + 2)) + 'px';
  }, [value]);
  return (
    <textarea ref={ref} className="codefield" data-widget value={value} spellCheck={false}
      onChange={(e) => onChange(e.target.value)} onPointerDown={stop} onDoubleClick={stop}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
          const el = e.currentTarget;
          const s = el.selectionStart, en = el.selectionEnd;
          const next = value.slice(0, s) + '  ' + value.slice(en);
          onChange(next);
          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
        }
      }}
      onWheel={stop}
    />
  );
}

const PORT_TYPES: PortType[] = ['number', 'boolean', 'trigger', 'color', 'vector', 'image'];
export function PortsEditor({ ports, onChange, allowOutputs }: { ports: { inputs: PortDef[]; outputs: PortDef[] }; onChange: (p: { inputs: PortDef[]; outputs: PortDef[] }) => void; allowOutputs: boolean }) {
  const fix = (name: string, taken: string[]) => {
    let s = name.replace(/[^A-Za-z0-9_]/g, '').replace(/^[0-9]+/, '') || 'x';
    let base = s, i = 2;
    while (taken.includes(s)) s = `${base}${i++}`;
    return s;
  };
  const row = (side: 'inputs' | 'outputs', p: PortDef, i: number) => (
    <div className="portrow" key={side + i}>
      <span className="dot" style={{ background: TYPE_COLORS[p.type] }} />
      <input value={p.name} data-widget onPointerDown={stop} onKeyDown={stop} onChange={(e) => {
        const list = ports[side].slice();
        list[i] = { ...p, name: fix(e.target.value, list.filter((_, j) => j !== i).map((q) => q.name)) };
        onChange({ ...ports, [side]: list });
      }} />
      <select value={p.type} data-widget onPointerDown={stop} onChange={(e) => {
        const list = ports[side].slice();
        const type = e.target.value as PortType;
        list[i] = { ...p, type, default: type === 'number' ? 0 : type === 'color' ? [255, 255, 255, 255] : type === 'vector' ? { x: 0, y: 0 } : false, widget: type === 'number' ? 'number' : type === 'color' ? 'color' : type === 'boolean' ? 'bool' : type === 'vector' ? 'vector' : 'none' };
        onChange({ ...ports, [side]: list });
      }}>
        {PORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button className="x" data-widget onPointerDown={stop} onClick={() => onChange({ ...ports, [side]: ports[side].filter((_, j) => j !== i) })}>×</button>
    </div>
  );
  const add = (side: 'inputs' | 'outputs') => {
    const list = ports[side];
    const name = fix(side === 'inputs' ? 'abcdefgh'[list.length] ?? 'in' : 'out', list.map((p) => p.name));
    onChange({ ...ports, [side]: [...list, { name, type: 'number', default: 0, widget: 'number' }] });
  };
  return (
    <div className="portseditor" data-widget onPointerDown={stop} onDoubleClick={stop}>
      <div className="portsgroup">
        <span className="portslabel">inputs <button onClick={() => add('inputs')}>+</button></span>
        {ports.inputs.map((p, i) => row('inputs', p, i))}
      </div>
      {allowOutputs && (
        <div className="portsgroup">
          <span className="portslabel">outputs <button onClick={() => add('outputs')}>+</button></span>
          {ports.outputs.map((p, i) => row('outputs', p, i))}
        </div>
      )}
    </div>
  );
}
