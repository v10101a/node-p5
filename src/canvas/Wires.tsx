import React, { memo } from 'react';
import type { EdgeData, PortType } from '../types';
import { TYPE_COLORS } from '../types';

export interface WireGeom {
  id: string;
  a: { x: number; y: number }; // output side
  b: { x: number; y: number }; // input side
  type: PortType | null;
  looseA: boolean;
  looseB: boolean;
}

export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.min(160, Math.abs(b.x - a.x) * 0.5));
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export const Wires = memo(function Wires({ wires, selected, live }: { wires: WireGeom[]; selected: Set<string>; live?: { a: { x: number; y: number }; b: { x: number; y: number }; type: PortType | null } | null }) {
  return (
    <svg className="wires" width="1" height="1" style={{ overflow: 'visible' }}>
      {wires.map((w) => {
        const color = w.type ? TYPE_COLORS[w.type] : '#a0a0a8';
        const d = wirePath(w.a, w.b);
        const sel = selected.has(w.id);
        return (
          <g key={w.id} className={'wire' + (sel ? ' selected' : '') + (w.type === 'draw' ? ' draw' : '')} data-edge={w.id}>
            <path d={d} className="hit" />
            <path d={d} className="line" stroke={color} />
            {w.looseA && <circle className="loose" cx={w.a.x} cy={w.a.y} r={6} fill={color} data-loose="from" data-edge={w.id} />}
            {w.looseB && <circle className="loose" cx={w.b.x} cy={w.b.y} r={6} fill={color} data-loose="to" data-edge={w.id} />}
          </g>
        );
      })}
      {live && (
        <g className="wire live">
          <path d={wirePath(live.a, live.b)} className="line" stroke={live.type ? TYPE_COLORS[live.type] : '#a0a0a8'} />
        </g>
      )}
    </svg>
  );
});
