<script>
  import { buildFrameHtml } from './runtime/frame.js';
  import { live, ui } from './state.svelte.js';
  let { code, size, compileErrors } = $props();
  let iframe = $state(null);
  let ready = $state(false);
  let status = $state.raw(null);
  let pos = $state.raw(loadPos());
  let dragging = $state(false);
  let drag = null;
  const html = buildFrameHtml(new URL('/p5.min.js', location.origin).href);
  const stop = (e) => e.stopPropagation();

  function loadPos() {
    try { const s = localStorage.getItem('patch-preview'); if (s) return JSON.parse(s); } catch {}
    return { x: -1, y: 64, w: 420 };
  }

  $effect(() => {
    const onMsg = (e) => {
      if (e.source !== iframe?.contentWindow) return;
      const m = e.data;
      if (!m) return;
      if (m.type === 'ready') ready = true;
      else if (m.type === 'probes') live.setProbes(m.data);
      else if (m.type === 'error') status = { kind: m.kind, message: m.message };
      else if (m.type === 'ok') status = null;
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  // send new code to the sketch (debounced a little)
  $effect(() => {
    if (!ready) return;
    const c = code;
    const t = setTimeout(() => iframe?.contentWindow?.postMessage({ type: 'code', code: c }, '*'), 30);
    return () => clearTimeout(t);
  });

  $effect(() => { try { localStorage.setItem('patch-preview', JSON.stringify(pos)); } catch {} });

  const w = $derived(pos.w);
  const h = $derived(Math.max(60, Math.round((w * size.h) / size.w)));
  const x = $derived(pos.x < 0 ? window.innerWidth - w - 16 : pos.x);
  const err = $derived(status ? `${status.kind}: ${status.message}` : compileErrors[0]);
  $effect(() => { ui.previewRect = { x, y: pos.y, w, h: h + 30 + (err ? 28 : 0) }; });

  const onDown = (mode) => (e) => {
    e.stopPropagation();
    drag = { sx: e.clientX, sy: e.clientY, x, y: pos.y, w, mode };
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
  };
  function onMove(e) {
    const d = drag;
    if (!d) return;
    if (d.mode === 'move') pos = { ...pos, x: Math.max(0, d.x + e.clientX - d.sx), y: Math.max(0, d.y + e.clientY - d.sy) };
    else pos = { ...pos, w: Math.max(160, Math.min(window.innerWidth - 40, d.w + e.clientX - d.sx)) };
  }
  function onUp() { drag = null; dragging = false; }
</script>

<div class="preview" class:dragging style:left="{x}px" style:top="{pos.y}px" style:width="{w}px" onpointerdown={stop} ondblclick={stop}>
  <div class="preview-head" onpointerdown={onDown('move')} onpointermove={onMove} onpointerup={onUp}>
    <span class="dot" class:bad={!!err} class:ok={!err && ready}></span>
    <span class="title">sketch</span>
    <span class="dim">{size.w} × {size.h}</span>
  </div>
  <iframe bind:this={iframe} title="sketch" srcdoc={html} style:width="{w}px" style:height="{h}px" style:pointer-events={dragging ? 'none' : 'auto'}></iframe>
  {#if err}<div class="preview-err">{err}</div>{/if}
  <span class="resize" onpointerdown={onDown('resize')} onpointermove={onMove} onpointerup={onUp}></span>
</div>
