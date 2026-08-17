<script>
  import Dialog from './Dialog.svelte';
  import { pod, ISSUERS, connect, disconnect, push, pull, applyIncoming } from './solid.svelte.js';
  import { fmtDate } from './units.js';

  let { onclose } = $props();

  let custom = $state('');

  const when = (iso) =>
    iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;

  async function loadFromPod() {
    const remote = await pull();
    if (remote) applyIncoming(remote);
  }
</script>

<Dialog title={pod.state === 'on' ? 'Your pod' : 'Connect a pod'} kicker="Where this is kept" {onclose}>
  {#snippet children()}
    {#if pod.error}
      <div class="notice">{pod.error}</div>
    {/if}

    {#if pod.state === 'on'}
      {#if pod.migrated}
        <div class="notice">
          This pod still holds the older JSON document. It has been read in — your
          next change writes it back as Turtle at the address below. The old file
          is left where it is.
        </div>
      {/if}

      <div class="notice ok">
        Everything you change is written to your pod as Turtle within a second or
        two. This device keeps its own copy too, so the app still works offline.
      </div>

      <div class="field">
        <span class="eyebrow">Signed in as</span>
        <p class="addr">{pod.webId}</p>
      </div>

      <div class="field">
        <span class="eyebrow">File</span>
        <p class="addr">{pod.fileUrl}</p>
      </div>

      <div class="field">
        <span class="eyebrow">Last write</span>
        <p class="addr">
          {pod.syncing ? 'saving…' : pod.lastSync ? `${when(pod.lastSync)}, ${fmtDate(pod.lastSync)}` : 'not yet'}
        </p>
      </div>
    {:else if pod.state === 'connecting'}
      <p class="hint">Waiting on your pod provider…</p>
    {:else}
      <p style="margin:0;color:var(--chalk-2)">
        A Solid pod is storage you own, at an address you control. Connect one and
        your family's sizes live there instead of only in this browser — readable
        from any device you sign in on.
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
    {#if pod.state === 'on'}
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
