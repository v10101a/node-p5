// Reactive view of the shared document and the UI state, for Svelte components.
import { subscribe, getGraph, awareness, provider } from './store.js';

let graph = $state.raw(getGraph());
subscribe(() => { graph = getGraph(); });

let remotes = $state.raw([]);
function recomputeRemotes() {
  const out = [];
  for (const [clientId, st] of awareness.getStates()) {
    if (clientId === awareness.clientID || !st?.user) continue;
    out.push({ clientId, user: st.user, cursor: st.cursor, selection: st.selection, drag: st.drag });
  }
  remotes = out;
}
awareness.on('change', recomputeRemotes);

let probes = $state.raw({});
let connected = $state(provider.wsconnected);
provider.on('status', (e) => { connected = e.status === 'connected'; });

/** the shared document, remote users, and live values from the running sketch */
export const live = {
  get graph() { return graph; },
  get remotes() { return remotes; },
  get probes() { return probes; },
  setProbes(d) { probes = d; },
};
export const net = { get connected() { return connected; } };

// ---------- UI state ----------
let view = $state.raw({ x: 0, y: 0, k: 1 });
let selection = $state.raw(new Set());
let palette = $state.raw(null); // { screen: {x,y}, world: {x,y} } while open
let showCode = $state(false);
let previewRect = $state.raw(null);

export const ui = {
  get view() { return view; }, set view(v) { view = v; },
  get selection() { return selection; }, set selection(s) { selection = s; },
  get palette() { return palette; }, set palette(p) { palette = p; },
  get showCode() { return showCode; }, set showCode(v) { showCode = v; },
  get previewRect() { return previewRect; }, set previewRect(r) { previewRect = r; },
};

/** last known mouse position in world coordinates (not reactive; read on demand) */
export const mouseWorld = { x: 0, y: 0 };
