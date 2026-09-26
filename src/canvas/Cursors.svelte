<script>
  let { remotes, k } = $props();
</script>

{#each remotes as r (r.clientId)}
  {#if r.cursor}
    <div class="cursor" style:transform="translate({r.cursor.x}px, {r.cursor.y}px) scale({1 / k})">
      <svg width="18" height="22" viewBox="0 0 18 22">
        <path d="M2 2 L16 11 L9.5 12.5 L6 20 Z" fill={r.user.color} stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
      <span class="cursor-name" style:background={r.user.color}>{r.user.name}</span>
    </div>
  {/if}
{/each}
