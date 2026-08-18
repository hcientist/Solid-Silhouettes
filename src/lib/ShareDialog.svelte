<script>
  import Dialog from './Dialog.svelte';
  import {
    pod, scopeUrl, readAccess, setAccess, WHOLE,
    createViewLink, loadViewLinks, revokeViewLink
  } from './solid.svelte.js';
  import { fmtDate } from './units.js';

  let { scope, title, onclose } = $props();

  let entries = $state([]);
  let loading = $state(true);
  let listError = $state(null);
  let webId = $state('');
  let level = $state('read');
  let busy = $state(false);
  let formError = $state(null);
  let copied = $state(false);
  let copiedLink = $state(null);
  let includeVitals = $state(false);
  let making = $state(false);
  let linkError = $state(null);
  let fresh = $state(null);

  const url = $derived(scopeUrl(scope));
  const whole = $derived(scope.kind === 'all');

  async function refresh() {
    loading = true;
    const res = await readAccess(scope);
    entries = res.entries;
    listError = res.error;
    loading = false;
  }

  $effect(() => {
    refresh();
    loadViewLinks();
  });

  async function makeLink() {
    linkError = null;
    making = true;
    const res = await createViewLink(scope, { includeVitals });
    making = false;
    if (!res.ok) return (linkError = res.error);
    fresh = res.link;
    await copyText(res.link, res.link);
  }

  async function copyText(text, mark = true) {
    try {
      await navigator.clipboard.writeText(text);
      copiedLink = mark;
      setTimeout(() => (copiedLink = null), 1800);
    } catch {
      linkError = 'This browser would not let the page copy. Select the link and copy it by hand.';
    }
  }

  async function give() {
    formError = null;
    busy = true;
    const res = await setAccess(scope, webId, level);
    busy = false;
    if (!res.ok) return (formError = res.error);
    webId = '';
    await refresh();
  }

  async function change(id, next) {
    busy = true;
    const res = await setAccess(scope, id, next);
    busy = false;
    if (!res.ok) formError = res.error;
    await refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      formError = 'This browser would not let the page copy. Select the address and copy it by hand.';
    }
  }
</script>

<Dialog title="Share" kicker={title} {onclose}>
  {#snippet children()}
    <p style="margin:0;color:var(--chalk-2)">
      {#if whole}
        Give someone access to everyone in the wardrobe, including anyone you add
        later — you would need to share those individually.
      {:else}
        Give someone access to this one person. Nobody else in the wardrobe comes
        with them.
      {/if}
    </p>

    <div class="field">
      <span class="eyebrow">They will need this address</span>
      <div class="addr-row">
        <p class="addr">{url}</p>
        <button class="btn ghost" style="height:26px;padding:0 9px" onclick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p class="hint">Access is granted to a WebID; send them the link yourself.</p>
    </div>

    <div class="field">
      <label for="share-webid">Their WebID</label>
      <input
        id="share-webid"
        type="text"
        bind:value={webId}
        placeholder="https://them.solidcommunity.net/profile/card#me"
        autocomplete="off"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Enter' && give()}
      />
      <div class="give-row">
        <div class="unit-toggle" role="group" aria-label="Access level">
          <button aria-pressed={level === 'read'} onclick={() => (level = 'read')}>Can read</button>
          <button aria-pressed={level === 'write'} onclick={() => (level = 'write')}>Can edit</button>
        </div>
        <button class="btn primary" onclick={give} disabled={busy || !webId.trim()}>Give access</button>
      </div>
      {#if formError}<div class="notice">{formError}</div>{/if}
    </div>

    <hr class="rule-line" />

    <div class="field">
      <span class="eyebrow">Anyone with the link</span>
      <p class="hint" style="margin:0">
        Publishes a read-only copy at an address nobody can guess, so someone
        with no pod of their own can open it. Treat the link like a password:
        anyone who gets hold of it can read it, without signing in. It follows
        your edits to whoever it covers, and drops anyone you remove. Someone you
        add to the wardrobe later is not included — publish a new link for them.
      </p>

      <label class="check">
        <input type="checkbox" bind:checked={includeVitals} />
        <span>Include height and weight</span>
      </label>

      <button class="btn" onclick={makeLink} disabled={making || pod.state !== 'on'}>
        {making ? 'Publishing…' : 'Create a link'}
      </button>
      {#if linkError}<div class="notice">{linkError}</div>{/if}
      {#if fresh}
        <div class="notice ok">
          Link copied. <span class="mono" style="overflow-wrap:anywhere">{fresh}</span>
        </div>
      {/if}

      {#if pod.viewLinks.length}
        <ul class="shared">
          {#each pod.viewLinks as l (l.url)}
            <li>
              <span class="who">{l.names.join(', ')}{l.vitals ? ' · with vitals' : ''}</span>
              <span class="lvl">{fmtDate(l.at)}</span>
              <button
                class="btn ghost"
                style="height:24px;padding:0 8px;font-size:10px"
                onclick={() => copyText(l.link, l.url)}
              >
                {copiedLink === l.url ? 'Copied' : 'Copy'}
              </button>
              <button
                class="btn ghost danger"
                style="height:24px;padding:0 8px;font-size:10px"
                onclick={() => revokeViewLink(l.url)}
              >
                Withdraw
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <hr class="rule-line" />

    <div class="field">
      <span class="eyebrow">Shared with a WebID</span>
      {#if loading}
        <p class="hint">Asking the pod…</p>
      {:else if listError}
        <div class="notice">{listError}</div>
      {:else if !entries.length}
        <p class="hint">Nobody yet. Only you can see this.</p>
      {:else}
        <ul class="shared">
          {#each entries as e (e.webId)}
            <li>
              <span class="who">{e.webId}</span>
              <span class="lvl">{e.write ? 'can edit' : 'can read'}</span>
              <button
                class="btn ghost"
                style="height:24px;padding:0 8px;font-size:10px"
                disabled={busy}
                onclick={() => change(e.webId, e.write ? 'read' : 'write')}
              >
                {e.write ? 'Make read-only' : 'Allow edits'}
              </button>
              <button
                class="btn ghost danger"
                style="height:24px;padding:0 8px;font-size:10px"
                disabled={busy}
                onclick={() => change(e.webId, 'none')}
              >
                Stop
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/snippet}

  {#snippet actions()}
    <span class="spacer"></span>
    <button class="btn" onclick={onclose}>Done</button>
  {/snippet}
</Dialog>

<style>
  .addr-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
  }
  .addr {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--chalk-2);
    overflow-wrap: anywhere;
  }
  .give-row {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }
  .shared {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--mat-edge);
    border-radius: 2px;
  }
  .shared li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 8px;
    align-items: center;
    padding: 8px 9px;
    border-bottom: 1px solid var(--chalk-line);
  }
  .shared li:last-child {
    border-bottom: 0;
  }
  .shared .who {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--chalk-2);
    overflow-wrap: anywhere;
  }
  .shared .lvl {
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--chalk-3);
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .shared li {
      grid-template-columns: 1fr auto;
      row-gap: 6px;
    }
    .shared .who {
      grid-column: 1 / -1;
    }
  }
</style>
