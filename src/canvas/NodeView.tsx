import React, { memo, useEffect, useRef, useState } from 'react';
import type { NodeData, PortDef, PortType } from '../types';
import { TYPE_COLORS, CATEGORY_COLORS, canConnect } from '../types';
import { DEFS } from '../nodes/defs';
import { expandInputs, getPortDefs, inputValue } from '../nodes/ports';
import { setParam, renameNode, setPorts } from '../store';
import { useProbe } from '../hooks';
import { NumberField, ColorField, BoolField, VectorField, SelectField, TextField, CodeField, PortsEditor, SliderField, colorCss } from './widgets';
import { sizes, nodeWidth } from './layout';

export interface WireHint { type: PortType; side: 'from' | 'to' }

interface Props {
  node: NodeData;
  connected: string; // comma-joined connected input port names
  x: number;
  y: number;
  selected: boolean;
  remoteColor?: string;
  wire: WireHint | null;
}

function ProbeValue({ nodeId, port, type }: { nodeId: string; port: string; type: PortType }) {
  const v = useProbe(nodeId, port);
  if (v === undefined) return null;
  if (type === 'color') return <span className="probe swatch" style={{ background: colorCss(v) }} />;
  if (type === 'boolean') return <span className={'probe bool' + (v ? ' on' : '')}>{v ? 'true' : 'false'}</span>;
  if (type === 'trigger') return <span className={'probe trig' + (v ? ' on' : '')}>{v ? '•' : '·'}</span>;
  if (type === 'vector') return <span className="probe">{fmtN(v?.x)}, {fmtN(v?.y)}</span>;
  return <span className="probe">{fmtN(v)}</span>;
}
function fmtN(v: any) {
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  return a >= 100 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString();
}

function Port({ node, port, side, hint }: { node: NodeData; port: PortDef; side: 'in' | 'out'; hint: WireHint | null }) {
  let cls = 'port ' + side + ' t-' + port.type;
  if (hint) {
    // dragging a wire: the end being dragged wants the opposite side
    const wantSide = hint.side === 'from' ? 'in' : 'out';
    const ok = side === wantSide && (side === 'in' ? canConnect(hint.type, port.type) : canConnect(port.type, hint.type));
    cls += ok ? ' hot' : ' dim';
  }
  return <span className={cls} data-port={side} data-node={node.id} data-name={port.name} style={{ background: TYPE_COLORS[port.type] }} title={`${port.name}: ${port.type}`} />;
}

function Widget({ node, port }: { node: NodeData; port: PortDef }) {
  const v = inputValue(node, port);
  const set = (val: any) => setParam(node.id, port.name, val);
  if (typeof v === 'string' && port.widget !== 'number' && port.widget !== 'color') {
    return <NumberField value={v} onChange={set} />; // an expression in a non-number slot
  }
  switch (port.widget ?? (port.type === 'number' ? 'number' : 'none')) {
    case 'number': return <NumberField value={typeof v === 'string' ? v : Number(v ?? 0)} min={port.min} max={port.max} step={port.step} onChange={set} />;
    case 'color': return <ColorField value={v ?? null} nullable={port.name === 'stroke' || port.name === 'fill'} onChange={set} />;
    case 'bool': return <BoolField value={!!v} onChange={set} />;
    case 'vector': return <VectorField value={v} onChange={set} />;
    default: return null;
  }
}

function Param({ node, def }: { node: NodeData; def: NonNullable<import('../types').NodeDef['params']>[number] }) {
  const v = node.params?.[def.name] ?? def.default;
  const set = (val: any) => setParam(node.id, def.name, val);
  switch (def.widget) {
    case 'select': return <div className="param"><span className="plabel">{def.label ?? def.name}</span><SelectField value={v} options={def.options ?? []} onChange={set} /></div>;
    case 'text': return <div className="param"><TextField value={String(v ?? '')} onChange={set} placeholder={def.name} /></div>;
    case 'code': return <div className="param code"><CodeField value={String(v ?? '')} onChange={set} /></div>;
    case 'bool': return <div className="param"><span className="plabel">{def.label ?? def.name}</span><BoolField value={!!v} onChange={set} /></div>;
    case 'color': return <div className="param"><span className="plabel">{def.label ?? def.name}</span><ColorField value={v} onChange={set} /></div>;
    case 'number': return <div className="param"><span className="plabel">{def.label ?? def.name}</span><NumberField value={typeof v === 'string' ? v : Number(v ?? 0)} onChange={set} /></div>;
    case 'ports': return <PortsEditor ports={node.ports ?? def.default} allowOutputs={node.type === 'code'} onChange={(p) => setPorts(node.id, p)} />;
  }
  return null;
}

function ExprBody({ node }: { node: NodeData }) {
  const kind = String(node.params?.kind ?? 'number');
  return (
    <div className="exprnode">
      <TextField value={String(node.params?.expr ?? '')} placeholder="mouseX / width" onChange={(v) => setParam(node.id, 'expr', v)} />
      <div className="param"><span className="plabel">type</span>
        <SelectField value={kind} options={['number', 'color', 'vector', 'boolean']} onChange={(k) => { setParam(node.id, 'kind', k); setPorts(node.id, { inputs: [], outputs: [{ name: 'out', type: k as PortType }] }); }} />
      </div>
    </div>
  );
}

function CanvasExtras({ node }: { node: NodeData }) {
  const globals = String(node.params?.globals ?? ''), setup = String(node.params?.setup ?? '');
  const [open, setOpen] = useState(!!(globals || setup));
  if (!open) return <button className="linkbtn" data-widget onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(true)}>+ globals / setup code</button>;
  return (
    <div className="canvasextras">
      <span className="plabel">globals</span>
      <CodeField value={globals} onChange={(v) => setParam(node.id, 'globals', v)} />
      <span className="plabel">setup</span>
      <CodeField value={setup} onChange={(v) => setParam(node.id, 'setup', v)} />
    </div>
  );
}

function NumberNodeBody({ node }: { node: NodeData }) {
  const value = Number(node.params?.value ?? 50);
  const min = Number(node.params?.min ?? 0), max = Number(node.params?.max ?? 100);
  return (
    <div className="numbernode">
      <SliderField value={value} min={min} max={max} onChange={(v) => setParam(node.id, 'value', v)} />
      <div className="range">
        <NumberField value={min} width={44} onChange={(v) => setParam(node.id, 'min', v)} />
        <NumberField value={value} width={60} onChange={(v) => setParam(node.id, 'value', v)} />
        <NumberField value={max} width={44} onChange={(v) => setParam(node.id, 'max', v)} />
      </div>
    </div>
  );
}

export const NodeView = memo(function NodeView({ node, connected, x, y, selected, remoteColor, wire }: Props) {
  const def = DEFS[node.type];
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [nameText, setNameText] = useState(node.name);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => sizes.set(node.id, { w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    sizes.set(node.id, { w: el.offsetWidth, h: el.offsetHeight });
    return () => { ro.disconnect(); sizes.delete(node.id); };
  }, [node.id]);

  if (!def) return null;
  const conn = new Set(connected ? connected.split(',') : []);
  const inputs = expandInputs(node, conn);
  const outputs = getPortDefs(node).outputs;
  const isCanvas = node.type === 'canvas';

  const style: React.CSSProperties = { left: x, top: y, width: nodeWidth(node) };
  if (remoteColor) style.boxShadow = `0 0 0 2px ${remoteColor}`;

  return (
    <div ref={ref} className={'node cat-' + def.category + (selected ? ' selected' : '') + (isCanvas ? ' canvasnode' : '')} data-node={node.id} style={style}>
      <div className="node-head" style={{ background: CATEGORY_COLORS[def.category] }}>
        {editing ? (
          <input className="node-rename" autoFocus value={nameText} data-widget
            onChange={(e) => setNameText(e.target.value)}
            onBlur={() => { setEditing(false); renameNode(node.id, nameText); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
            onPointerDown={(e) => e.stopPropagation()} />
        ) : (
          <span className="node-title" onDoubleClick={(e) => { e.stopPropagation(); setNameText(node.name); setEditing(true); }} title="double-click to rename">{node.name}</span>
        )}
        {node.name !== def.label.toLowerCase() && <span className="node-type">{def.label}</span>}
      </div>
      <div className="node-body">
        {outputs.map((o) => (
          <div className="row out" key={'o' + o.name}>
            <ProbeValue nodeId={node.id} port={o.name} type={o.type} />
            <span className="label">{o.label ?? o.name}</span>
            <Port node={node} port={o} side="out" hint={wire} />
          </div>
        ))}
        {inputs.map((p) => (
          <div className={'row in' + (conn.has(p.name) ? ' connected' : '')} key={'i' + p.name}>
            <Port node={node} port={p} side="in" hint={wire} />
            <span className="label">{p.label ?? p.name}</span>
            {!conn.has(p.name) && p.type !== 'draw' && <Widget node={node} port={p} />}
          </div>
        ))}
        {node.type === 'number' ? <NumberNodeBody node={node} />
          : node.type === 'expr' ? <ExprBody node={node} />
          : isCanvas ? <>{def.params?.filter((p) => p.widget !== 'code').map((pd) => <Param key={pd.name} node={node} def={pd} />)}<CanvasExtras node={node} /></>
          : def.params?.map((pd) => <Param key={pd.name} node={node} def={pd} />)}
        {isCanvas && <div className="canvas-hint">drawn top → bottom</div>}
      </div>
    </div>
  );
});
