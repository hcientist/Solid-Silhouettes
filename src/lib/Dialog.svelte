<script>
  let { title, kicker = null, onclose, children, actions } = $props();

  let el = $state(null);

  $effect(() => {
    if (el && !el.open) el.showModal();
  });

  function backdrop(e) {
    if (e.target === el) onclose();
  }
</script>

<dialog bind:this={el} onclose={onclose} onclick={backdrop} aria-label={title}>
  <div class="dlg-head">
    <div>
      {#if kicker}<span class="eyebrow" style="display:block;margin-bottom:5px">{kicker}</span>{/if}
      <h2>{title}</h2>
    </div>
    <button class="btn ghost" style="height:28px;padding:0 8px" onclick={onclose} aria-label="Close">
      ✕
    </button>
  </div>

  <div class="dlg-body">
    {@render children()}
  </div>

  <div class="dlg-foot">
    {@render actions()}
  </div>
</dialog>
