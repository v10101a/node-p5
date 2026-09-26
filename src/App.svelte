<script>
  import { onMount } from 'svelte';
  import * as S from './store.js';
  import { live, ui, mouseWorld } from './state.svelte.js';
  import { compile } from './compile.js';
  import { STARTER_SKETCH } from './decompile.js';
  import { applyCode } from './apply.js';
  import Canvas from './canvas/Canvas.svelte';
  import Minimap from './canvas/Minimap.svelte';
  import Palette from './Palette.svelte';
  import Preview from './Preview.svelte';
  import CodePanel from './CodePanel.svelte';
  import Toolbar from './Toolbar.svelte';

  let vp = $state.raw({ w: window.innerWidth, h: window.innerHeight });
  let showHelp = $state(!localStorage.getItem('patch-help-seen'));
  let fileInput = $state(null);
  const stop = (e) => e.stopPropagation();

  onMount(() => {
    S.whenReady().then(() => {
      if (S.getGraph().nodes.length === 0) {
        S.ensureCanvas();
        applyCode(STARTER_SKETCH);
        S.addNote(1060, 120, 'The sketch on the right is always running.\n\nEdit it as code with </> code, or here as nodes — both ways stay in sync.');
      } else S.ensureCanvas();
    });
    const onResize = () => { vp = { w: window.innerWidth, h: window.innerHeight }; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const graph = $derived(live.graph);
  const liveOut = $derived(compile(graph.nodes, graph.edges, true));
  const exportCode = $derived(ui.showCode ? compile(graph.nodes, graph.edges, false).code : '');
  const canvasNode = $derived(graph.nodes.find((n) => n.type === 'canvas'));
  const size = $derived({ w: Number(canvasNode?.params?.width) || 600, h: Number(canvasNode?.params?.height) || 400 });

  const centerWorld = () => ({ x: (vp.w / 2 - ui.view.x) / ui.view.k, y: (vp.h / 2 - ui.view.y) / ui.view.k });
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

  function pick(k) {
    const w = ui.palette?.world ?? centerWorld();
    let id = null;
    if (k === '@note') id = S.addNote(w.x, w.y);
    else if (k === '@group') id = S.addGroup({ x: w.x, y: w.y, w: 320, h: 220 });
    else id = S.addNode(k, w.x, w.y);
    ui.palette = null;
    if (id) ui.selection = new Set([id]);
  }
  function save() {
    const blob = new Blob([JSON.stringify(S.exportPatch(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.room}.patch.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (p.version !== 1) throw new Error('unknown format');
      S.loadPatch(p);
      ui.selection = new Set();
    } catch (err) {
      alert('Could not load that file: ' + err.message);
    }
  }
  function fresh() {
    if (graph.nodes.length > 1 && !confirm('Clear the whole canvas for everyone in this room?')) return;
    S.clearAll();
    S.ensureCanvas();
    ui.selection = new Set();
  }
</script>

<div class="app">
  <Canvas />
  <Toolbar
    onaddnode={() => { ui.palette = { screen: { x: vp.w / 2 - 140, y: vp.h / 2 - 190 }, world: centerWorld() }; }}
    onnote={() => { const c = centerWorld(); ui.selection = new Set([S.addNote(c.x - 100, c.y - 60)]); }}
    ongroup={() => key('g')} onfit={() => key('f')}
    onsave={save} onload={() => fileInput.click()} onnew={fresh} />
  <Preview code={liveOut.code} {size} compileErrors={liveOut.errors} />
  {#if ui.showCode}<CodePanel code={exportCode} onclose={() => (ui.showCode = false)} />{/if}
  {#if ui.palette}<Palette screen={ui.palette.screen} onpick={pick} onclose={() => (ui.palette = null)} />{/if}
  <div class="minimap-wrap" onpointerdown={stop}>
    <Minimap {graph} view={ui.view} viewport={vp} onjump={(wx, wy) => { const v = ui.view; ui.view = { ...v, x: vp.w / 2 - wx * v.k, y: vp.h / 2 - wy * v.k }; }} />
  </div>
  {#if showHelp}
    <div class="help" onpointerdown={stop}>
      <b>drag</b> pan · <b>⇧drag</b> select · <b>⌘scroll</b> zoom · <b>double-click</b> add node · <b>drag port</b> wire · <b>drop on nothing</b> dangles · <b>N</b> note · <b>G</b> group · <b>⌘C/⌘V</b> copy as JSON
      <button onclick={() => { showHelp = false; localStorage.setItem('patch-help-seen', '1'); }}>got it</button>
    </div>
  {/if}
  <input bind:this={fileInput} type="file" accept=".json,application/json" style="display: none" onchange={onFile} />
</div>
