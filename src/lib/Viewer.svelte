<script>
  /* What someone with no pod sees when they open a shared link. Read-only
     by construction: there is nothing here that can write anywhere. */
  import Stage from './Stage.svelte';
  import { viewer, viewerSelected } from './viewer.svelte.js';
  import { chalkHex, specLine } from './store.svelte.js';
  import { OUTLINE } from './figure.js';

  const person = $derived(viewerSelected());
  const host = $derived.by(() => {
    try {
      return new URL(viewer.sharedBy ?? viewer.source ?? '').host;
    } catch {
      return null;
    }
  });
</script>

<div class="shell">
  <header class="rail">
    <h1 class="wordmark"><span class="solid">Solid</span><span class="sil">Silhouettes</span></h1>
    <span class="rail-spacer"></span>
    <div class="rail-group">
      <span class="tag" aria-disabled="true" style="cursor:default">
        <span class="dot"></span>
        shared with you<span class="label-long">{host ? ` · ${host}` : ''}</span>
      </span>
    </div>
  </header>

  <div class="body">
    {#if viewer.people.length > 1}
      <nav class="roster" aria-label="Shared">
        <div class="roster-head">
          <span class="eyebrow">Shared</span>
          <span class="eyebrow">{viewer.people.length}</span>
        </div>
        <ul class="roster-list">
          {#each viewer.people as p (p.id)}
            <li>
              <button
                class="person"
                style:--pc={chalkHex(p.chalk)}
                aria-current={p.id === viewer.selectedId}
                onclick={() => (viewer.selectedId = p.id)}
              >
                <span class="swatch"></span>
                <span style="min-width:0">
                  <span class="pname">{p.name}</span>
                  <span class="pspec">{specLine(p)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    {/if}

    <main class="table">
      <div class="table-inner">
        {#if viewer.loading}
          <div class="empty-state">
            <div class="inner">
              <svg class="ghost" viewBox="0 0 240 470" aria-hidden="true"><path d={OUTLINE} /></svg>
              <p class="hint">Fetching what was shared…</p>
            </div>
          </div>
        {:else if viewer.error}
          <div class="empty-state">
            <div class="inner">
              <svg class="ghost" viewBox="0 0 240 470" aria-hidden="true"><path d={OUTLINE} /></svg>
              <h2>Nothing to see</h2>
              <p>{viewer.error}</p>
              <a class="btn" href={window.location.pathname}>Open the app instead</a>
            </div>
          </div>
        {:else if person}
          <Stage {person} readOnly units={viewer.units} />
        {/if}
      </div>
    </main>
  </div>

  {#if !viewer.loading && !viewer.error}
    <footer class="viewer-foot">
      <span>
        A read-only copy, published by whoever sent you the link. It is not
        connected to anything of yours.
      </span>
      <a class="btn ghost" href={window.location.pathname}>Start your own</a>
    </footer>
  {/if}
</div>

<style>
  .shell {
    grid-template-rows: var(--rail-h) minmax(0, 1fr) auto;
  }
  .viewer-foot .btn {
    white-space: nowrap;
    flex: none;
  }
  .viewer-foot span {
    min-width: 0;
  }
  .viewer-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 16px;
    border-top: 1px solid var(--mat-edge);
    background: var(--mat-deep);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--chalk-3);
  }
</style>
