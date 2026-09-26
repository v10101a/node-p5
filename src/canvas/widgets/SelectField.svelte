<script>
  let { value, options, onchange } = $props();
  const stop = (e) => e.stopPropagation();
</script>

<select class="selectfield" data-widget {value} onchange={(e) => onchange(e.target.value)} onpointerdown={stop} ondblclick={stop}>
  {#each options as o (o)}<option value={o}>{o}</option>{/each}
</select>
