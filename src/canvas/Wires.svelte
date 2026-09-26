<script>
  import { TYPE_COLORS } from '../types.js';
  // wires: [{ id, a, b, type, looseA, looseB }]; preview: an in-progress wire { a, b, type }
  let { wires, selected, preview = null } = $props();

  export function wirePath(a, b) {
    const dx = Math.max(40, Math.min(160, Math.abs(b.x - a.x) * 0.5));
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }
</script>

<svg class="wires" width="1" height="1" style="overflow: visible">
  {#each wires as w (w.id)}
    {@const color = w.type ? TYPE_COLORS[w.type] : '#a0a0a8'}
    {@const d = wirePath(w.a, w.b)}
    <g class="wire" class:selected={selected.has(w.id)} class:draw={w.type === 'draw'} data-edge={w.id}>
      <path {d} class="hit" />
      <path {d} class="line" stroke={color} />
      {#if w.looseA}<circle class="loose" cx={w.a.x} cy={w.a.y} r="6" fill={color} data-loose="from" data-edge={w.id} />{/if}
      {#if w.looseB}<circle class="loose" cx={w.b.x} cy={w.b.y} r="6" fill={color} data-loose="to" data-edge={w.id} />{/if}
    </g>
  {/each}
  {#if preview}
    <g class="wire live"><path d={wirePath(preview.a, preview.b)} class="line" stroke={preview.type ? TYPE_COLORS[preview.type] : '#a0a0a8'} /></g>
  {/if}
</svg>
