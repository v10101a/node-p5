<script>
  import { CATEGORY_COLORS } from '../types.js';
  import { DEFS } from '../nodes/defs.js';
  import { nodeWidth, estimateHeight, union } from './layout.js';
  let { graph, view, viewport, onjump } = $props();
  const W = 200, H = 130;
  let canvas = $state(null);
  let map = null;

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const vp = { x: -view.x / view.k, y: -view.y / view.k, w: viewport.w / view.k, h: viewport.h / view.k };
    const rects = [vp];
    for (const n of graph.nodes) rects.push({ x: n.x, y: n.y, w: nodeWidth(n), h: estimateHeight(n, graph.edges) });
    for (const n of graph.notes) rects.push(n);
    for (const g of graph.groups) rects.push(g);
    const b = union(rects);
    const pad = 40;
    const scale = Math.min((W - 16) / (b.w + pad * 2), (H - 16) / (b.h + pad * 2));
    const ox = 8 + ((W - 16) - (b.w + pad * 2) * scale) / 2 - (b.x - pad) * scale;
    const oy = 8 + ((H - 16) - (b.h + pad * 2) * scale) / 2 - (b.y - pad) * scale;
    map = { scale, ox, oy };
    const R = (r) => [ox + r.x * scale, oy + r.y * scale, Math.max(2, r.w * scale), Math.max(2, r.h * scale)];

    for (const g of graph.groups) { ctx.fillStyle = g.color + '33'; ctx.fillRect(...R(g)); }
    for (const n of graph.notes) { ctx.fillStyle = n.color; ctx.fillRect(...R(n)); }
    for (const n of graph.nodes) {
      const def = DEFS[n.type];
      ctx.fillStyle = def ? (def.category === 'output' ? '#2a2a2e' : CATEGORY_COLORS[def.category]) : '#ccc';
      ctx.fillRect(...R({ x: n.x, y: n.y, w: nodeWidth(n), h: estimateHeight(n, graph.edges) }));
    }
    ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 1.5;
    const [vx, vy, vw, vh] = R(vp);
    ctx.strokeRect(vx, vy, vw, vh);
  });

  function jump(e) {
    if (!map) return;
    const r = e.currentTarget.getBoundingClientRect();
    onjump((e.clientX - r.left - map.ox) / map.scale, (e.clientY - r.top - map.oy) / map.scale);
  }
</script>

<canvas bind:this={canvas} class="minimap" style:width="{W}px" style:height="{H}px"
  onpointerdown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); jump(e); }}
  onpointermove={(e) => { if (e.buttons) jump(e); }}></canvas>
