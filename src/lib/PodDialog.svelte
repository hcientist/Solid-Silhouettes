<script>
  import Dialog from './Dialog.svelte';
  import {
    pod, ISSUERS, connect, disconnect, push, pull, applyIncoming,
    chooseLocation, normaliseLocation
  } from './solid.svelte.js';
  import { fmtDate } from './units.js';

  let { onclose, onshare } = $props();

  let custom = $state('');
  let where = $state('');
  let moving = $state(false);
  let busy = $state(false);

  const when = (iso) =>
    iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;

  const preview = $derived(normaliseLocation(where) ?? '');

  const foundVia = {
    'type-index': 'Found in your profile’s type index.',
    existing: 'Found where it already was in your pod.',
    chosen: 'You chose this.'
  };

  async function pick() {
    busy = true;
    const ok = await chooseLocation(where);
    busy = false;
    if (ok) moving = false;
  }

  async function loadFromPod() {
    const remote = await pull();
    if (remote) applyIncoming(remote);
  }

  function startMove() {
    where = pod.base ?? pod.suggested ?? '';
    moving = true;
  }
</script>

<Dialog
  title={pod.needsLocation ? 'Where should this live?' : pod.state === 'on' ? 'Your pod' : 'Connect a pod'}
  kicker={pod.needsLocation ? pod.webId : 'Where this is kept'}
  {onclose}
>
  {#snippet children()}
    {#if pod.error}
      <div class="notice">{pod.error}</div>
    {/if}

    {#if pod.needsLocation || moving}
      <!-- A pod belongs to the person, not the app, so the folder is theirs
           to pick rather than ours to assume. -->
      <p style="margin:0;color:var(--chalk-2)">
        Nothing about this app is registered in your pod yet. Pick the folder it
        should write to — the suggestion below is only a suggestion.
      </p>

      <div class="field">
        <label for="pod-where">Folder or document</label>
        <input
          id="pod-where"
          type="text"
          bind:value={where}
          placeholder={pod.suggested}
          autocomplete="off"
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && pick()}
        />
        {#if preview}
          <p class="hint">Index goes at <span class="mono">{preview}</span>, with one document per person beside it.</p>
        {/if}
      </div>

      <div class="issuers">
        <button class="issuer" onclick={() => (where = pod.suggested)}>
          <span class="who">Use the usual folder</span>
          <span class="url">{(pod.suggested ?? '').replace(/^https?:\/\//, '')}</span>
        </button>
      </div>

      <p class="hint">
        Once you pick, the location is recorded in your profile’s type index, so
        any Solid app — including this one on another device — can find it
        instead of guessing.
      </p>
    {:else if pod.state === 'on'}
      {#if pod.migrated}
        <div class="notice">
          This pod still holds the older JSON document. It has been read in — your
          next change writes it back as Turtle, one document per person. The old
          file is left where it is.
        </div>
      {/if}

      {#if pod.unreadable}
        <div class="notice">
          {pod.unreadable}
          {pod.unreadable === 1 ? 'person document' : 'person documents'} in the index
          could not be read. They may have been removed, or belong to someone else.
        </div>
      {/if}

      <div class="notice ok">
        Everything you change is written to your pod as Turtle within a second or
        two, and only the documents that actually changed get rewritten. This
        device keeps its own copy too, so the app still works offline.
      </div>

      <div class="field">
        <span class="eyebrow">Signed in as</span>
        <p class="addr">{pod.webId}</p>
      </div>

      <div class="field">
        <div class="hist-head">
          <span class="eyebrow">Folder</span>
          <button class="btn ghost" style="height:24px;padding:0 8px;font-size:10px" onclick={startMove}>
            Change
          </button>
        </div>
        <p class="addr">{pod.base}</p>
        <p class="hint">
          {foundVia[pod.foundVia] ?? ''}
          {#if pod.registered?.ok}
            Registered in your {pod.registered.private ? 'private' : 'public'} type index.
          {:else if pod.registered && !pod.registered.ok}
            Your profile has no type index this app could write to, so the
            location is only remembered on this device.
          {/if}
        </p>
      </div>

      <div class="field">
        <span class="eyebrow">Last write</span>
        <p class="addr">
          {pod.syncing ? 'saving…' : pod.lastSync ? `${when(pod.lastSync)}, ${fmtDate(pod.lastSync)}` : 'not yet'}
        </p>
      </div>

      <div class="field">
        <span class="eyebrow">Sharing</span>
        <button class="issuer" onclick={onshare}>
          <span class="who">Share the whole wardrobe</span>
          <span class="url">by WebID</span>
        </button>
        <p class="hint">
          To share one person only, open them and use Share. Each person is a
          document of their own, so they can be handed over separately.
        </p>
      </div>
    {:else if pod.state === 'connecting'}
      <p class="hint">Waiting on your pod provider…</p>
    {:else}
      <p style="margin:0;color:var(--chalk-2)">
        A Solid pod is storage you own, at an address you control. Connect one and
        your family’s sizes live there instead of only in this browser — readable
        from any device you sign in on, and shareable with anyone you choose.
      </p>

      <div class="field">
        <span class="eyebrow">Choose your provider</span>
        <div class="issuers">
          {#each ISSUERS as i (i.url)}
            <button class="issuer" onclick={() => connect(i.url)}>
              <span class="who">{i.who}</span>
              <span class="url">{i.url.replace(/^https?:\/\//, '')}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <label for="pod-custom">Or type a provider address</label>
        <div class="inline">
          <input
            id="pod-custom"
            type="text"
            bind:value={custom}
            placeholder="https://your-pod-host.example"
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && connect(custom)}
          />
          <button class="btn" onclick={() => connect(custom)} disabled={!custom.trim()}>Go</button>
        </div>
        <p class="hint">
          You will be sent to that provider to sign in, then returned here. This app
          never sees your password. <a href="https://solidproject.org/" target="_blank" rel="noreferrer">What is Solid?</a>
        </p>
      </div>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if pod.needsLocation || moving}
      {#if moving && !pod.needsLocation}
        <button class="btn ghost" onclick={() => (moving = false)}>Cancel</button>
      {/if}
      <span class="spacer"></span>
      <button class="btn primary" onclick={pick} disabled={busy || !preview}>
        {pod.needsLocation ? 'Use this folder' : 'Move here'}
      </button>
    {:else if pod.state === 'on'}
      <button class="btn danger" onclick={() => { disconnect(); onclose(); }}>Disconnect</button>
      <span class="spacer"></span>
      <button class="btn" onclick={loadFromPod} disabled={pod.syncing}>Load from pod</button>
      <button class="btn primary" onclick={push} disabled={pod.syncing}>Save to pod</button>
    {:else}
      <span class="spacer"></span>
      <button class="btn" onclick={onclose}>Not now</button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .addr {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--chalk-2);
    overflow-wrap: anywhere;
  }
  .inline {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
</style>
