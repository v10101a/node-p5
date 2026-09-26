<script>
  let { value, min, max, onchange } = $props();
  const stop = (e) => e.stopPropagation();
</script>

<input type="range" class="slider" data-widget {min} {max} step={(max - min) / 200 || 0.01} {value} oninput={(e) => onchange(Number(e.target.value))} onpointerdown={stop} ondblclick={stop} />
