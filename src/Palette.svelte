<script>
  import { NODE_DEFS } from './nodes/defs.js';
  import { CATEGORY_COLORS } from './types.js';
  let { screen, onpick, onclose } = $props();
  let q = $state('');
  let idx = $state(0);
  let input = $state(null);
  const stop = (e) => e.stopPropagation();

  const SPECIALS = [
    { key: '@note', label: 'Sticky note', category: 'canvas', hint: 'a place to write' },
    { key: '@group', label: 'Group', category: 'canvas', hint: 'a named box' },
  ];
  const all = [
    ...NODE_DEFS.filter((d) => !d.singleton).map((d) => ({ key: d.type, label: d.label, category: d.category, hint: d.description })),
    ...SPECIALS,
  ];
  const items = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((i) => i.label.toLowerCase().includes(s) || i.key.includes(s) || i.category.includes(s) || i.hint?.toLowerCase().includes(s));
  });

  $effect(() => {
    input?.focus();
    const t = setTimeout(() => input?.focus(), 30);
    return () => clearTimeout(t);
  });

  const w = 280, h = 380;
  const x = $derived(Math.min(screen.x, window.innerWidth - w - 12));
  const y = $derived(Math.min(screen.y, window.innerHeight - h - 12));

  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); }
    else if (e.key === 'Enter' && items[idx]) onpick(items[idx].key);
  }
  const dot = (cat) => (cat === 'canvas' ? '#ffe27a' : cat === 'output' ? '#2a2a2e' : CATEGORY_COLORS[cat]);
</script>

<div class="palette" style:left="{x}px" style:top="{y}px" style:width="{w}px" onpointerdown={stop} ondblclick={stop}>
  <input bind:this={input} placeholder="add a node…" bind:value={q} oninput={() => (idx = 0)} onkeydown={onKey} />
  <div class="palette-list" style:max-height="{h - 50}px">
    {#if items.length === 0}<div class="palette-empty">nothing matches</div>{/if}
    {#each items as it, i (it.key)}
      {#if !q && (i === 0 || items[i - 1].category !== it.category)}<div class="palette-cat">{it.category}</div>{/if}
      <div class="palette-item" class:active={i === idx} onmouseenter={() => (idx = i)} onclick={() => onpick(it.key)}>
        <span class="dot" style:background={dot(it.category)}></span>
        <span class="pl">{it.label}</span>
        {#if it.hint}<span class="ph">{it.hint}</span>{/if}
      </div>
    {/each}
  </div>
</div>
