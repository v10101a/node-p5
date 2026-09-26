<script>
  import { room, me, undoManager } from './store.js';
  import { live, ui, net } from './state.svelte.js';
  let { onaddnode, onnote, ongroup, onsave, onload, onnew, onfit } = $props();
  let copied = $state(false);
  const stop = (e) => e.stopPropagation();
  async function share() {
    try { await navigator.clipboard.writeText(location.href); copied = true; setTimeout(() => (copied = false), 1500); } catch {}
  }
</script>

<div class="toolbar left" onpointerdown={stop} ondblclick={stop}>
  <span class="logo">◐ patch</span>
  <button class="room" onclick={share} title="copy link to this room">{copied ? 'link copied!' : `#${room}`}</button>
  <span class="sep"></span>
  <button onclick={() => undoManager.undo()} title="undo (⌘Z)">↶</button>
  <button onclick={() => undoManager.redo()} title="redo (⇧⌘Z)">↷</button>
  <span class="sep"></span>
  <button onclick={onaddnode} title="add node (Tab / double-click)">+ node</button>
  <button onclick={onnote} title="sticky note (N)">note</button>
  <button onclick={ongroup} title="group selection (G)">group</button>
  <button onclick={onfit} title="fit to view (F)">fit</button>
</div>
<div class="toolbar right" onpointerdown={stop} ondblclick={stop}>
  <span class="presence">
    <span class="avatar me" style:background={me.color} title="{me.name} (you)">{me.name[0]}</span>
    {#each live.remotes as r (r.clientId)}
      <span class="avatar" style:background={r.user.color} title={r.user.name}>{r.user.name[0]}</span>
    {/each}
    <span class="conn" class:on={net.connected} class:off={!net.connected} title={net.connected ? 'connected' : 'offline — changes are saved locally'}></span>
  </span>
  <span class="sep"></span>
  <button class:active={ui.showCode} onclick={() => (ui.showCode = !ui.showCode)} title="show compiled sketch.js">{'</>'} code</button>
  <button onclick={onsave} title="download patch as JSON">save</button>
  <button onclick={onload} title="load a patch JSON">load</button>
  <button onclick={onnew} title="clear the canvas">new</button>
</div>
