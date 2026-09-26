<script>
  // a number you can scrub, or a small expression string like `mouseX / 2`
  let { value, onchange, min, max, step, width } = $props();
  let editing = $state(false);
  let text = $state('');
  let input = $state(null);
  let drag = null;
  const isExpr = $derived(typeof value === 'string');
  const stop = (e) => e.stopPropagation();

  $effect(() => { if (editing && input) { input.focus(); input.select(); } });

  function fmt(v) {
    if (!Number.isFinite(v)) return '0';
    const a = Math.abs(v);
    if (a >= 1000) return String(Math.round(v));
    if (a >= 100) return v.toFixed(1).replace(/\.0$/, '');
    return String(Math.round(v * 100) / 100);
  }
  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  function onDown(e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (isExpr) { text = String(value); editing = true; return; }
    drag = { x: e.clientX, v: Number(value), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    const d = drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const s = (step ?? (Math.abs(d.v) < 2 && step === undefined ? 0.01 : 1)) * (e.shiftKey ? 10 : 1) * (e.altKey ? 0.1 : 1);
    const raw = d.v + dx * s * 0.5;
    const rounded = s >= 1 ? Math.round(raw) : Math.round(raw / s) * s;
    onchange(clamp(Number(rounded.toFixed(4))));
  }
  function onUp(e) {
    const d = drag;
    drag = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d && !d.moved) { text = String(value); editing = true; }
  }
  function commit() {
    editing = false;
    const t = text.trim();
    if (t === '') return;
    const v = Number(t);
    if (Number.isFinite(v)) onchange(clamp(v));
    else onchange(t); // an expression
  }
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') editing = false;
  }
</script>

{#if editing}
  <input bind:this={input} class="numfield editing" class:expr={isExpr} data-widget bind:value={text}
    style:width={isExpr ? Math.max(width ?? 60, 120) + 'px' : width ? width + 'px' : null}
    onblur={commit} onkeydown={onKey} onpointerdown={stop} />
{:else if isExpr}
  <div class="numfield expr" data-widget style:width={Math.max(width ?? 60, 60) + 'px'} onpointerdown={onDown} ondblclick={stop} title="ƒ {value} — click to edit"><span class="fx">ƒ</span>{value}</div>
{:else}
  <div class="numfield" data-widget style:width={width ? width + 'px' : null} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} ondblclick={stop}
    title="drag to change, click to type a number or an expression">{fmt(Number(value))}</div>
{/if}
