<script>
  import { applyCode } from './apply.js';
  import { ui } from './state.svelte.js';
  let { code, onclose } = $props();
  let text = $state(code);
  let status = $state.raw({ kind: 'synced' });
  let copied = $state(false);
  let focused = false;
  let timer = null;
  let pre = $state(null);
  let ta = $state(null);
  const stop = (e) => e.stopPropagation();

  // follow the graph while not editing
  $effect(() => {
    const c = code;
    if (!focused) { text = c; status = { kind: 'synced' }; }
  });

  function highlight(src) {
    const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(function|const|let|var|if|else|for|return|new|true|false|null)\b|\b(\d+\.?\d*)\b/gm, (m, c, s, k, n) => {
      if (c) return `<span class="c">${c}</span>`;
      if (s) return `<span class="s">${s}</span>`;
      if (k) return `<span class="k">${k}</span>`;
      if (n) return `<span class="n">${n}</span>`;
      return m;
    });
  }
  const html = $derived(highlight(text) + '\n');

  function apply(t) {
    const r = applyCode(t);
    status = r.ok ? { kind: 'applied' } : { kind: 'error', msg: r.error };
    return r.ok;
  }
  function onInput(e) {
    text = e.target.value;
    status = { kind: 'dirty' };
    clearTimeout(timer);
    timer = setTimeout(() => apply(text), 600);
  }
  function onBlur() {
    focused = false;
    clearTimeout(timer);
    if (status.kind === 'dirty' && !apply(text)) return;
    if (status.kind === 'error') return; // keep the broken text visible
    text = code;
    status = { kind: 'synced' };
  }
  function onKey(e) {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); apply(text); }
    else if (e.key === 'Escape') e.currentTarget.blur();
    else if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart, en = el.selectionEnd;
      text = text.slice(0, s) + '  ' + text.slice(en);
      status = { kind: 'dirty' };
      clearTimeout(timer);
      timer = setTimeout(() => apply(text), 600);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  }
  function sync() { if (pre && ta) { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; } }
  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1200); } catch {} }
  function download() {
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sketch.js';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  // dock below the preview when it sits in the right-hand column
  const dock = $derived.by(() => {
    const a = ui.previewRect;
    if (a && a.x + a.w > window.innerWidth - 560) return `top: ${Math.min(a.y + a.h + 12, window.innerHeight - 220)}px; width: ${Math.max(460, a.w)}px`;
    return '';
  });
</script>

<div class="codepanel" style={dock} onpointerdown={stop} ondblclick={stop} onwheel={stop}>
  <div class="codepanel-head">
    <span class="title">sketch.js</span>
    <span class="status {status.kind}">
      {#if status.kind === 'synced'}in sync · edit me{:else if status.kind === 'dirty'}editing…{:else if status.kind === 'applied'}applied to the patch{:else}{status.msg ?? 'error'}{/if}
    </span>
    <span class="spacer"></span>
    <button onclick={copy}>{copied ? 'copied!' : 'copy'}</button>
    <button onclick={download}>download</button>
    <button onclick={onclose}>×</button>
  </div>
  <div class="codewrap">
    <pre bind:this={pre} class="code" aria-hidden="true">{@html html}</pre>
    <textarea bind:this={ta} class="code codeinput" value={text} spellcheck="false" wrap="off"
      oninput={onInput} onfocus={() => { focused = true; }} onblur={onBlur} onkeydown={onKey} onscroll={sync}></textarea>
  </div>
</div>
