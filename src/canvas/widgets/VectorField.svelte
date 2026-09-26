<script>
  import NumberField from './NumberField.svelte';
  let { value, onchange } = $props();
  const v = $derived(value ?? { x: 0, y: 0 });
</script>

<span class="vecfield">
  <NumberField value={v.x} width={40} onchange={(x) => onchange({ ...v, x })} />
  <NumberField value={v.y} width={40} onchange={(y) => onchange({ ...v, y })} />
</span>
