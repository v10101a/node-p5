<script>
  let { value, onchange } = $props();
  const stop = (e) => e.stopPropagation();
</script>

<button class="boolfield" class:on={value} data-widget onpointerdown={stop} ondblclick={stop} onclick={() => onchange(!value)}><span class="knob"></span></button>
