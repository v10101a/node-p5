import * as S from './store.js';
import { planFromCode } from './decompile.js';

/** replace the shared patch with what the code says, keeping unchanged nodes in place */
export function applyCode(code) {
  try {
    S.ensureCanvas();
    const g = S.getGraph();
    const plan = planFromCode(code, g.nodes, g.edges);
    S.tx(() => {
      S.deleteNodes(plan.remove);
      S.setCanvasParams(plan.canvasParams);
      for (const n of plan.upserts) S.upsertNode(n);
      S.replaceEdges(plan.edges);
    });
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message ?? e);
    return { ok: false, error: e?.loc ? `line ${e.loc.line}: ${msg.replace(/\s*\(\d+:\d+\)$/, '')}` : msg };
  }
}
