<script>
  // a color: [r, g, b, a], null (none), or an expression string of fill() arguments like `num % 255, 500, 50`
  import { colorCss, toHex, fromHex } from '../color.js';
  let { value, onchange, nullable = false } = $props();
  let editing = $state(false);
  let text = $state('');
  let input = $state(null);
  const isExpr = $derived(typeof value === 'string');
  const arr = $derived(Array.isArray(value) ? value : null);
  const stop = (e) => e.stopPropagation();

  $effect(() => { if (editing && input) { input.focus(); input.select(); } });

  function commit() {
    editing = false;
    const t = text.trim();
    if (!t) return;
    const parts = t.split(',').map((x) => Number(x.trim()));
    if (parts.every((n) => Number.isFinite(n)) && (parts.length === 1 || parts.length === 3 || parts.length === 4)) {
      const [r, g, b, a] = parts.length === 1 ? [parts[0], parts[0], parts[0], 255] : [parts[0], parts[1], parts[2], parts[3] ?? 255];
      onchange([r, g, b, a]);
    } else onchange(t);
  }
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') editing = false;
  }
</script>

{#if editing}
  <input bind:this={input} class="numfield editing expr" data-widget bind:value={text} style:width="130px" onblur={commit} onkeydown={onKey} onpointerdown={stop} />
{:else}
  <span class="colorfield" data-widget onpointerdown={stop} ondblclick={stop}>
    {#if isExpr}
      <span class="numfield expr" style:width="96px" title="ƒ {value} — click to edit" onclick={() => { text = value; editing = true; }}><span class="fx">ƒ</span>{value}</span>
    {:else}
      <label class="swatch" class:none={!arr} style:background={arr ? colorCss(arr) : null} title={arr ? toHex(arr) : 'none'}>
        <input type="color" value={toHex(arr)} oninput={(e) => onchange(fromHex(e.target.value, arr?.[3] ?? 255))} />
      </label>
    {/if}
    {#if nullable}
      <button class="nonebtn" class:active={!value} title={value ? 'set to none' : 'set a color'} onclick={() => onchange(value ? null : [40, 40, 46, 255])}>∅</button>
    {/if}
    {#if !isExpr}
      <button class="nonebtn" title="type r, g, b or an expression" onclick={() => { text = arr ? arr.slice(0, 3).map(Math.round).join(', ') : ''; editing = true; }}>ƒ</button>
    {/if}
  </span>
{/if}
