<script>
  import { onMount } from 'svelte';
  import { updateNote, nextNoteColor, removeItems } from '../store.js';
  import { sizes } from './layout.js';
  let { note, x, y, selected, remoteColor } = $props();
  let ta = $state(null);
  const id = note.id;
  const stop = (e) => e.stopPropagation();
  $effect(() => { sizes.set(id, { w: note.w, h: note.h }); });
  onMount(() => {
    if (selected && !note.text) ta?.focus(); // a note you just made is ready to type into
    return () => sizes.delete(id);
  });
</script>

<div class="note" class:selected data-note={note.id}
  style:left="{x}px" style:top="{y}px" style:width="{note.w}px" style:height="{note.h}px" style:background={note.color}
  style:box-shadow={remoteColor ? `0 0 0 2px ${remoteColor}` : null}>
  <div class="note-head">
    <button class="note-color" data-widget style:background={nextNoteColor(note.color)} title="change color" onpointerdown={stop} onclick={() => updateNote(note.id, { color: nextNoteColor(note.color) })}></button>
    <span class="grip">⋯</span>
    <button class="note-x" data-widget onpointerdown={stop} onclick={() => removeItems([note.id])} title="delete">×</button>
  </div>
  <textarea bind:this={ta} class="note-text" data-widget value={note.text} placeholder="write something…" spellcheck="false"
    oninput={(e) => updateNote(note.id, { text: e.target.value })} onpointerdown={stop} onkeydown={stop} onwheel={stop}></textarea>
  <span class="resize" data-resize={note.id}></span>
</div>
