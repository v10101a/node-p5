import { useSyncExternalStore } from 'react';
import { subscribe, getGraph, awareness } from './store';

export function useGraph() {
  return useSyncExternalStore(subscribe, getGraph, getGraph);
}

// ---------- awareness ----------
export interface RemoteState {
  clientId: number;
  user: { name: string; color: string };
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  drag?: Record<string, { x: number; y: number }> | null;
}
let remotes: RemoteState[] = [];
const awListeners = new Set<() => void>();
function recomputeRemotes() {
  const out: RemoteState[] = [];
  for (const [clientId, st] of awareness.getStates()) {
    if (clientId === awareness.clientID || !st?.user) continue;
    out.push({ clientId, user: st.user, cursor: st.cursor, selection: st.selection, drag: st.drag });
  }
  remotes = out;
  for (const l of awListeners) l();
}
awareness.on('change', recomputeRemotes);
export function useRemotes(): RemoteState[] {
  return useSyncExternalStore(
    (l) => { awListeners.add(l); return () => { awListeners.delete(l); }; },
    () => remotes,
    () => remotes,
  );
}

// ---------- live probes from the running sketch ----------
export const probes: Record<string, any> = {};
let probeVersion = 0;
const probeListeners = new Set<() => void>();
export function setProbes(data: Record<string, any>) {
  for (const k of Object.keys(probes)) delete probes[k];
  Object.assign(probes, data);
  probeVersion++;
  for (const l of probeListeners) l();
}
export function useProbe(nodeId: string, port: string): any {
  useSyncExternalStore(
    (l) => { probeListeners.add(l); return () => { probeListeners.delete(l); }; },
    () => probeVersion,
    () => probeVersion,
  );
  return probes[`${nodeId}|${port}`];
}
