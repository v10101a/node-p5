<script>
  import { updateGroup } from '../store.js';
  let { group, x, y, selected } = $props();
  let editing = $state(false);
  let text = $state('');
  const stop = (e) => e.stopPropagation();
  const autofocus = (el) => el.focus();
</script>

<div class="group" class:selected data-group={group.id}
  style:left="{x}px" style:top="{y}px" style:width="{group.w}px" style:height="{group.h}px" style:border-color={group.color} style:background={group.color + '14'}>
  <div class="group-head" data-group-header={group.id} style:background={group.color}>
    {#if editing}
      <input use:autofocus bind:value={text} data-widget
        onblur={() => { editing = false; if (text.trim()) updateGroup(group.id, { name: text.trim() }); }}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') editing = false; }}
        onpointerdown={stop} />
    {:else}
      <span ondblclick={(e) => { e.stopPropagation(); text = group.name; editing = true; }}>{group.name}</span>
    {/if}
  </div>
  <span class="resize" data-resize={group.id}></span>
</div>
