<script>
  import { TYPE_COLORS } from '../../types.js';
  let { ports, onchange, allowOutputs = false } = $props();
  const PORT_TYPES = ['number', 'boolean', 'trigger', 'color', 'vector', 'image'];
  const stop = (e) => e.stopPropagation();

  function fix(name, taken) {
    let s = name.replace(/[^A-Za-z0-9_]/g, '').replace(/^[0-9]+/, '') || 'x';
    const base = s;
    let i = 2;
    while (taken.includes(s)) s = `${base}${i++}`;
    return s;
  }
  function rename(side, i, name) {
    const list = ports[side].slice();
    list[i] = { ...list[i], name: fix(name, list.filter((_, j) => j !== i).map((q) => q.name)) };
    onchange({ ...ports, [side]: list });
  }
  function retype(side, i, type) {
    const list = ports[side].slice();
    const def = type === 'number' ? 0 : type === 'color' ? [255, 255, 255, 255] : type === 'vector' ? { x: 0, y: 0 } : false;
    const widget = type === 'number' ? 'number' : type === 'color' ? 'color' : type === 'boolean' ? 'bool' : type === 'vector' ? 'vector' : 'none';
    list[i] = { ...list[i], type, default: def, widget };
    onchange({ ...ports, [side]: list });
  }
  function remove(side, i) {
    onchange({ ...ports, [side]: ports[side].filter((_, j) => j !== i) });
  }
  function add(side) {
    const list = ports[side];
    const name = fix(side === 'inputs' ? 'abcdefgh'[list.length] ?? 'in' : 'out', list.map((p) => p.name));
    onchange({ ...ports, [side]: [...list, { name, type: 'number', default: 0, widget: 'number' }] });
  }
</script>

{#snippet rows(side)}
  {#each ports[side] as p, i (side + i)}
    <div class="portrow">
      <span class="dot" style:background={TYPE_COLORS[p.type]}></span>
      <input value={p.name} data-widget onpointerdown={stop} onkeydown={stop} oninput={(e) => rename(side, i, e.target.value)} />
      <select value={p.type} data-widget onpointerdown={stop} onchange={(e) => retype(side, i, e.target.value)}>
        {#each PORT_TYPES as t (t)}<option value={t}>{t}</option>{/each}
      </select>
      <button class="x" data-widget onpointerdown={stop} onclick={() => remove(side, i)}>×</button>
    </div>
  {/each}
{/snippet}

<div class="portseditor" data-widget onpointerdown={stop} ondblclick={stop}>
  <div class="portsgroup">
    <span class="portslabel">inputs <button onclick={() => add('inputs')}>+</button></span>
    {@render rows('inputs')}
  </div>
  {#if allowOutputs}
    <div class="portsgroup">
      <span class="portslabel">outputs <button onclick={() => add('outputs')}>+</button></span>
      {@render rows('outputs')}
    </div>
  {/if}
</div>
