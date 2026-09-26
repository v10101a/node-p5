import * as S from './store';
import { planFromCode } from './decompile';

/** replace the shared patch with what the code says, keeping unchanged nodes in place */
export function applyCode(code: string): { ok: true } | { ok: false; error: string } {
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
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { ok: false, error: e?.loc ? `line ${e.loc.line}: ${msg.replace(/\s*\(\d+:\d+\)$/, '')}` : msg };
  }
}
