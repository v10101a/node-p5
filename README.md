# patch — a node canvas for p5.js

A loose, spatial, multiplayer patching canvas that compiles to a plain `sketch.js`.
Nodes are p5 snippets with typed ports; the sketch beside the canvas is always running;
share the URL and someone else is in the same room, cursors and all.

```
npm install
npm run dev        # http://localhost:5173  (app + websocket relay on one port)
npm run build && npm start   # production: serves dist/ + relay
```

Rooms are the URL hash (`#amber-x7k2`). A room is kept in memory on the server and
snapshotted to `./data/`, and every client also keeps a copy in IndexedDB, so a patch
survives a server restart and works offline.

## Two ways in: nodes and code

The graph is the shared document, but the code panel is editable and applies back to the
patch as you type (or on ⌘↩). Statements the parser understands become typed nodes
(`background`, `rect`, `ellipse`, `circle`, `line`, `text`, `image`, `push…pop` →
`transform`, simple `for` loops → `repeat`, `const x = …` → an `expr` node). Anything else
becomes a **code block** that runs verbatim at that point in draw order, so nothing you
write is ever lost: it just isn't a pretty node yet. Top-level declarations and extra
`setup()` lines live on the canvas node as *globals* and *setup*.

Parameters accept expressions, not just numbers: click a number field and type
`mouseX / 2` or `50 + sin(frameCount * 0.05) * 20`. That's how a sketch like

```js
circle(mouseX, mouseY, 50 + sin(frameCount * 0.05) * 20);
```

stays one node instead of six. Wires are for values you actually want to route.

When you edit code, nodes whose compiled lines are unchanged stay exactly where they were;
shape nodes are matched by type and order under the same parent; new statements get new
nodes placed near the canvas.

## The execution model (the hard part)

p5 is imperative and order-dependent; a node UI is dataflow. Three ways to bridge that:

- **(a) Trigger/exec ports** (Blueprint, cables): explicit, but every drawing node grows an
  extra wire and the canvas fills with control-flow spaghetti.
- **(b) Spatial ordering** (b5): no extra wires, but position becomes semantics. Tidying the
  canvas changes the sketch, which you can't have on a shared canvas.
- **(c) What this does: drawing is a value.** Shape nodes don't draw; they emit a `draw`
  value. Compositing nodes take *ordered* `draw` inputs: `canvas`, `layers`, `transform`,
  `repeat`, `render`. Draw order is the port order, nesting gives `push()/pop()` for free,
  and position is purely cosmetic. Because the model is pure dataflow, the compiler can
  inline it into an ordinary `draw()`, and the parser can read one back.

Stateful things (a counter, a toggle, a metronome, a mouse *click*) still fit: `trigger` is
a boolean true for one frame, and stateful nodes compile to a module-level `let` plus one
update line. Or just write `num = num + 10;` in a code block, like the starter does.

## What's here

- ~37 nodes: inputs (number, color, vector, time, size, mouse, noise, oscillator, metro),
  math (expression, math, fn, map, lerp, smooth, compare, switch, counter, toggle, split),
  color (hsb, rgb, mix), draw (background, rect, ellipse, circle, line, polygon, text,
  image), compose (layers, transform, repeat, render-to-image), custom (`code` returns a
  value, code block runs statements), and the `canvas` output.
- Live sketch in a sandboxed iframe; hot-swaps `draw()` without recreating the canvas.
  Live values flow back into the nodes.
- `</> code`: the compiled `sketch.js`, editable both ways; copy or download it, runs with
  p5 2.x global mode.
- Multiplayer via Yjs: shared graph, cursors, presence, remote selections, live drags,
  per-user undo/redo.
- Sticky notes, named groups, minimap, dangling wires, marquee selection, save/load JSON,
  copy/paste of a selection as JSON (paste plain text and it becomes a note).

## Keys

drag the canvas: pan · `⇧drag`: marquee select · `⌘scroll`: zoom · `double-click` / `Tab` /
right-click: add node · drag from a port: wire · drop a wire on a node body: connects to the
first matching input · `N` note · `G` group selection · `F` fit · `⌘Z` / `⇧⌘Z` undo/redo ·
`⌘C` `⌘V` `⌘D` · `Delete`.

## Layout

Plain JavaScript and Svelte 5, no TypeScript. Vite is the only build tool, and only because
Svelte components need compiling. The sketch itself runs unbundled from a `<script>` tag.

```
server.js              websocket relay (y-protocols) + Vite in dev / static files in prod
src/compile.js         graph → sketch.js
src/decompile.js       sketch.js → graph (best effort, code blocks for the rest)
src/nodes/defs.js      the node library: ports + a compile rule per node
src/store.js           Yjs doc, awareness, undo, all mutations, import/export
src/state.svelte.js    reactive view of the doc + UI state for components
src/canvas/*.svelte    the canvas: nodes, wires, notes, groups, cursors, minimap, widgets
src/runtime/frame.js   the iframe that runs the sketch
```
