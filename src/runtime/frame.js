/** HTML for the sandboxed preview iframe. It loads p5 and hot-swaps setup/draw when new code arrives. */
export function buildFrameHtml(p5Url) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #111; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  main { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
  canvas { max-width: 100%; max-height: 100%; width: auto !important; height: auto !important; object-fit: contain; display: block; }
</style>
<script src="${p5Url}"></script>
</head><body>
<script>
(function () {
  let started = false;
  let errReported = false;
  const probes = {};
  let probeDirty = false;
  window.__probe = function (o) { Object.assign(probes, o); probeDirty = true; };
  setInterval(function () {
    if (!probeDirty) return;
    probeDirty = false;
    parent.postMessage({ type: 'probes', data: probes }, '*');
  }, 100);
  function report(kind, e) {
    parent.postMessage({ type: 'error', kind: kind, message: String((e && e.message) || e) }, '*');
  }
// live-mode canvas: create once, then resize when the patch changes size
  window.__canvas = function (w, h) {
    if (!started || !window.width) return createCanvas(w, h);
    if (w !== width || h !== height) resizeCanvas(w, h);
  };
  function wrapDraw() {
    const userDraw = window.draw;
    if (typeof userDraw !== 'function') return;
    window.draw = function () {
      try {
        userDraw();
        if (errReported) { errReported = false; parent.postMessage({ type: 'ok' }, '*'); }
      } catch (e) {
        if (!errReported) { errReported = true; report('runtime', e); }
      }
    };
  }
  window.addEventListener('message', function (ev) {
    const msg = ev.data;
    if (!msg || msg.type !== 'code') return;
    const prevSetup = window.setup, prevDraw = window.draw;
    try {
      (0, eval)(msg.code);
    } catch (e) {
      report('compile', e);
      window.setup = prevSetup; window.draw = prevDraw;
      return;
    }
    errReported = false;
    wrapDraw();
    if (!started) {
      started = true;
      try { new p5(); } catch (e) { report('setup', e); }
    } else {
      try {
        const r = window.setup && window.setup();
        if (r && r.then) r.catch(function (e) { report('setup', e); });
      } catch (e) { report('setup', e); }
    }
    parent.postMessage({ type: 'ok' }, '*');
  });
  parent.postMessage({ type: 'ready' }, '*');
})();
</script>
</body></html>`;
}
