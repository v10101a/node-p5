<script>
  let { value, onchange } = $props();
  let el = $state(null);
  const stop = (e) => e.stopPropagation();
  $effect(() => {
    value; // re-measure when the text changes
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(320, Math.max(64, el.scrollHeight + 2)) + 'px';
  });
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = el.selectionStart, en = el.selectionEnd;
      onchange(value.slice(0, s) + '  ' + value.slice(en));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  }
</script>

<textarea bind:this={el} class="codefield" data-widget {value} spellcheck="false" oninput={(e) => onchange(e.target.value)} onpointerdown={stop} ondblclick={stop} onkeydown={onKey} onwheel={stop}></textarea>
