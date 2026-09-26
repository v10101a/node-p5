<script>
  let { value, onchange, placeholder = '', mono = false } = $props();
  const stop = (e) => e.stopPropagation();
</script>

<input class="textfield" class:mono data-widget {value} {placeholder} oninput={(e) => onchange(e.target.value)} onpointerdown={stop} ondblclick={stop} onkeydown={stop} />
