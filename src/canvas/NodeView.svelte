<script>
  import { TYPE_COLORS, CATEGORY_COLORS, canConnect } from '../types.js';
  import { DEFS } from '../nodes/defs.js';
  import { expandInputs, getPortDefs, inputValue } from '../nodes/ports.js';
  import { setParam, renameNode, setPorts } from '../store.js';
  import { live } from '../state.svelte.js';
  import { sizes, nodeWidth } from './layout.js';
  import { colorCss } from './color.js';
  import NumberField from './widgets/NumberField.svelte';
  import ColorField from './widgets/ColorField.svelte';
  import BoolField from './widgets/BoolField.svelte';
  import VectorField from './widgets/VectorField.svelte';
  import SelectField from './widgets/SelectField.svelte';
  import TextField from './widgets/TextField.svelte';
  import CodeField from './widgets/CodeField.svelte';
  import PortsEditor from './widgets/PortsEditor.svelte';
  import SliderField from './widgets/SliderField.svelte';

  // wire: { type, side } while a wire is being dragged, to highlight compatible ports
  let { node, connected, x, y, selected, remoteColor, wire } = $props();
  let el = $state(null);
  let editing = $state(false);
  let nameText = $state('');
  let extrasOpen = $state(!!(node.params?.globals || node.params?.setup));
  const id = node.id;
  const stop = (e) => e.stopPropagation();
  const autofocus = (n) => n.focus();

  const def = $derived(DEFS[node.type]);
  const conn = $derived(new Set(connected ? connected.split(',') : []));
  const inputs = $derived(expandInputs(node, conn));
  const outputs = $derived(getPortDefs(node).outputs);
  const isCanvas = $derived(node.type === 'canvas');

  $effect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => sizes.set(id, { w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    sizes.set(id, { w: el.offsetWidth, h: el.offsetHeight });
    return () => { ro.disconnect(); sizes.delete(id); };
  });

  function portClass(port, side) {
    let cls = 'port ' + side + ' t-' + port.type;
    if (wire) {
      const wantSide = wire.side === 'from' ? 'in' : 'out';
      const ok = side === wantSide && (side === 'in' ? canConnect(wire.type, port.type) : canConnect(port.type, wire.type));
      cls += ok ? ' hot' : ' dim';
    }
    return cls;
  }
  const probe = (port) => live.probes[`${node.id}|${port}`];
  function fmtN(v) {
    if (typeof v !== 'number') return String(v);
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
  }
  const widgetKind = (p) => p.widget ?? (p.type === 'number' ? 'number' : 'none');
  const set = (name) => (val) => setParam(node.id, name, val);
  const paramValue = (pd) => node.params?.[pd.name] ?? pd.default;
  const num = (v) => (typeof v === 'string' ? v : Number(v ?? 0));
</script>

{#snippet param(pd)}
  {@const v = paramValue(pd)}
  {#if pd.widget === 'select'}
    <div class="param"><span class="plabel">{pd.label ?? pd.name}</span><SelectField value={v} options={pd.options ?? []} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'text'}
    <div class="param"><TextField value={String(v ?? '')} placeholder={pd.name} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'code'}
    <div class="param code"><CodeField value={String(v ?? '')} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'bool'}
    <div class="param"><span class="plabel">{pd.label ?? pd.name}</span><BoolField value={!!v} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'color'}
    <div class="param"><span class="plabel">{pd.label ?? pd.name}</span><ColorField value={v} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'number'}
    <div class="param"><span class="plabel">{pd.label ?? pd.name}</span><NumberField value={num(v)} onchange={set(pd.name)} /></div>
  {:else if pd.widget === 'ports'}
    <PortsEditor ports={node.ports ?? pd.default} allowOutputs={node.type === 'code'} onchange={(p) => setPorts(node.id, p)} />
  {/if}
{/snippet}

<div bind:this={el} class="node cat-{def?.category}" class:selected class:canvasnode={isCanvas} data-node={node.id}
  style:left="{x}px" style:top="{y}px" style:width="{nodeWidth(node)}px" style:box-shadow={remoteColor ? `0 0 0 2px ${remoteColor}` : null}>
  {#if def}
    <div class="node-head" style:background={CATEGORY_COLORS[def.category]}>
      {#if editing}
        <input class="node-rename" use:autofocus bind:value={nameText} data-widget
          onblur={() => { editing = false; renameNode(node.id, nameText); }}
          onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') editing = false; }}
          onpointerdown={stop} />
      {:else}
        <span class="node-title" ondblclick={(e) => { e.stopPropagation(); nameText = node.name; editing = true; }} title="double-click to rename">{node.name}</span>
      {/if}
      {#if node.name !== def.label.toLowerCase()}<span class="node-type">{def.label}</span>{/if}
    </div>
    <div class="node-body">
      {#each outputs as o (o.name)}
        {@const v = probe(o.name)}
        <div class="row out">
          {#if v !== undefined}
            {#if o.type === 'color'}<span class="probe swatch" style:background={colorCss(v)}></span>
            {:else if o.type === 'boolean'}<span class="probe bool" class:on={v}>{v ? 'true' : 'false'}</span>
            {:else if o.type === 'trigger'}<span class="probe trig" class:on={v}>{v ? '•' : '·'}</span>
            {:else if o.type === 'vector'}<span class="probe">{fmtN(v?.x)}, {fmtN(v?.y)}</span>
            {:else}<span class="probe">{fmtN(v)}</span>{/if}
          {/if}
          <span class="label">{o.label ?? o.name}</span>
          <span class={portClass(o, 'out')} data-port="out" data-node={node.id} data-name={o.name} style:background={TYPE_COLORS[o.type]} title="{o.name}: {o.type}"></span>
        </div>
      {/each}
      {#each inputs as p (p.name)}
        {@const isConn = conn.has(p.name)}
        <div class="row in" class:connected={isConn}>
          <span class={portClass(p, 'in')} data-port="in" data-node={node.id} data-name={p.name} style:background={TYPE_COLORS[p.type]} title="{p.name}: {p.type}"></span>
          <span class="label">{p.label ?? p.name}</span>
          {#if !isConn && p.type !== 'draw'}
            {@const v = inputValue(node, p)}
            {@const kind = widgetKind(p)}
            {#if typeof v === 'string' && kind !== 'number' && kind !== 'color'}
              <NumberField value={v} onchange={set(p.name)} />
            {:else if kind === 'number'}
              <NumberField value={num(v)} min={p.min} max={p.max} step={p.step} onchange={set(p.name)} />
            {:else if kind === 'color'}
              <ColorField value={v ?? null} nullable={p.name === 'stroke' || p.name === 'fill'} onchange={set(p.name)} />
            {:else if kind === 'bool'}
              <BoolField value={!!v} onchange={set(p.name)} />
            {:else if kind === 'vector'}
              <VectorField value={v} onchange={set(p.name)} />
            {/if}
          {/if}
        </div>
      {/each}

      {#if node.type === 'number'}
        {@const value = Number(node.params?.value ?? 50)}
        {@const min = Number(node.params?.min ?? 0)}
        {@const max = Number(node.params?.max ?? 100)}
        <div class="numbernode">
          <SliderField {value} {min} {max} onchange={set('value')} />
          <div class="range">
            <NumberField value={min} width={44} onchange={set('min')} />
            <NumberField {value} width={60} onchange={set('value')} />
            <NumberField value={max} width={44} onchange={set('max')} />
          </div>
        </div>
      {:else if node.type === 'expr'}
        <div class="exprnode">
          <TextField value={String(node.params?.expr ?? '')} placeholder="mouseX / width" onchange={set('expr')} />
          <div class="param"><span class="plabel">type</span>
            <SelectField value={String(node.params?.kind ?? 'number')} options={['number', 'color', 'vector', 'boolean']}
              onchange={(k) => { setParam(node.id, 'kind', k); setPorts(node.id, { inputs: [], outputs: [{ name: 'out', type: k }] }); }} />
          </div>
        </div>
      {:else if isCanvas}
        {#each (def.params ?? []).filter((p) => p.widget !== 'code') as pd (pd.name)}{@render param(pd)}{/each}
        {#if extrasOpen}
          <div class="canvasextras">
            <span class="plabel">globals</span>
            <CodeField value={String(node.params?.globals ?? '')} onchange={set('globals')} />
            <span class="plabel">setup</span>
            <CodeField value={String(node.params?.setup ?? '')} onchange={set('setup')} />
          </div>
        {:else}
          <button class="linkbtn" data-widget onpointerdown={stop} onclick={() => (extrasOpen = true)}>+ globals / setup code</button>
        {/if}
      {:else}
        {#each def.params ?? [] as pd (pd.name)}{@render param(pd)}{/each}
      {/if}
      {#if isCanvas}<div class="canvas-hint">drawn top → bottom</div>{/if}
    </div>
  {/if}
</div>
