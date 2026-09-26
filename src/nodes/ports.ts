import type { NodeData, PortDef, EdgeData } from '../types';
import { DEFS } from './defs';

export function getDef(node: NodeData) {
  return DEFS[node.type];
}

/** Unexpanded port defs, with custom-node ports merged in. */
export function getPortDefs(node: NodeData): { inputs: PortDef[]; outputs: PortDef[] } {
  const def = DEFS[node.type];
  if (!def) return { inputs: [], outputs: [] };
  if (node.ports) return { inputs: [...def.inputs, ...node.ports.inputs], outputs: [...def.outputs, ...node.ports.outputs] };
  return { inputs: def.inputs, outputs: def.outputs };
}

export const VARIADIC_RE = /^(.*?)(\d+)$/;

/** Ports on the input side with variadic ports expanded to name0..nameN (+ one empty slot). */
export function expandInputs(node: NodeData, connected: Set<string>): PortDef[] {
  const { inputs } = getPortDefs(node);
  const res: PortDef[] = [];
  for (const p of inputs) {
    if (!p.variadic) { res.push(p); continue; }
    let max = -1;
    for (const c of connected) {
      const m = VARIADIC_RE.exec(c);
      if (m && m[1] === p.name) max = Math.max(max, Number(m[2]));
    }
    const count = max + 2;
    for (let i = 0; i < count; i++) res.push({ ...p, name: `${p.name}${i}`, label: i === 0 ? p.name : '', variadic: false });
  }
  return res;
}

export function connectedInputs(nodeId: string, edges: EdgeData[]): Set<string> {
  const s = new Set<string>();
  for (const e of edges) if (e.to?.node === nodeId && e.from) s.add(e.to.port);
  return s;
}

export function findInput(node: NodeData, port: string, connected: Set<string>): PortDef | undefined {
  return expandInputs(node, connected).find((p) => p.name === port);
}
export function findOutput(node: NodeData, port: string): PortDef | undefined {
  return getPortDefs(node).outputs.find((p) => p.name === port);
}

/** inline value for an input (param or default) */
export function inputValue(node: NodeData, p: PortDef): any {
  const v = node.params?.[p.name];
  return v === undefined ? p.default : v;
}
