<script>
  import { doc, ui, select, selected, chalkHex, specLine } from './lib/store.svelte.js';
  import { pod, bootPod, applyIncoming, keepLocal } from './lib/solid.svelte.js';
  import { fmtDate } from './lib/units.js';
  import { OUTLINE } from './lib/figure.js';

  import Stage from './lib/Stage.svelte';
  import NestView from './lib/NestView.svelte';
  import LedgerView from './lib/LedgerView.svelte';
  import Dialog from './lib/Dialog.svelte';
  import PersonDialog from './lib/PersonDialog.svelte';
  import GarmentDialog from './lib/GarmentDialog.svelte';
  import VitalsDialog from './lib/VitalsDialog.svelte';
  import PodDialog from './lib/PodDialog.svelte';

  /* null = closed. Everything modal funnels through one variable so two
     dialogs can never be open at once. */
  let modal = $state(null);

  const person = $derived(selected());

  $effect(() => {
    bootPod();
  });

  const podTag = $derived.by(() => {
    if (pod.syncing) return { cls: 'busy', text: 'saving', long: ' to pod' };
    if (pod.state === 'on') return { cls: 'on', text: 'pod', long: ' connected' };
    if (pod.state === 'connecting') return { cls: 'busy', text: 'connecting', long: '' };
    if (pod.state === 'error') return { cls: 'bad', text: 'pod', long: ' problem' };
    return { cls: '', text: 'this device', long: ' only' };
  });

  function openGarment(regionId) {
    modal = { kind: 'garment', regionId };
  }
</script>

<div class="shell">
  <header class="rail">
    <h1 class="wordmark"><span class="solid">Solid</span><span class="sil">Silhouettes</span></h1>

    <span class="rail-spacer"></span>

    <div class="rail-group">
      <div class="unit-toggle" role="group" aria-label="Units">
        <button aria-pressed={doc.units === 'metric'} onclick={() => (doc.units = 'metric')}>cm/kg</button>
        <button aria-pressed={doc.units === 'imperial'} onclick={() => (doc.units = 'imperial')}>in/lb</button>
      </div>

      <button class="tag {podTag.cls}" onclick={() => (modal = { kind: 'pod' })}>
        <span class="dot"></span>
        {podTag.text}<span class="label-long">{podTag.long}</span>
      </button>
    </div>
  </header>

  <div class="body">
    <nav class="roster" aria-label="Family">
      <div class="roster-head">
        <span class="eyebrow">On the table</span>
        <span class="eyebrow">{doc.people.length}</span>
      </div>

      <ul class="roster-list">
        {#each doc.people as p (p.id)}
          <li>
            <button
              class="person"
              style:--pc={chalkHex(p.chalk)}
              aria-current={ui.view === 'person' && p.id === ui.selectedId}
              onclick={() => select(p.id)}
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

      <div class="roster-foot">
        <button class="btn primary" onclick={() => (modal = { kind: 'person', person: null })}>
          Add person
        </button>
        {#if doc.people.length}
          <div class="view-switch" role="group" aria-label="View">
            <button
              aria-pressed={ui.view === 'nest'}
              disabled={doc.people.length < 2}
              title={doc.people.length < 2 ? 'Needs two people to nest' : 'Overlay everyone to scale'}
              onclick={() => (ui.view = ui.view === 'nest' ? 'person' : 'nest')}>Nest</button
            >
            <button
              aria-pressed={ui.view === 'ledger'}
              onclick={() => (ui.view = ui.view === 'ledger' ? 'person' : 'ledger')}>Ledger</button
            >
          </div>
        {/if}
      </div>
    </nav>

    <main class="table">
      <div class="table-inner">
        {#if doc.people.length === 0}
          <div class="empty-state">
            <div class="inner">
              <svg class="ghost" viewBox="0 0 240 470" aria-hidden="true">
                <path d={OUTLINE} />
              </svg>
              <h2>Nothing on the table</h2>
              <p>
                Add the first person and you get a figure to mark up. Click its
                head for glasses, its torso for shirt sizes, its legs for pants,
                its feet for shoes.
              </p>
              <button class="btn primary" onclick={() => (modal = { kind: 'person', person: null })}>
                Add the first person
              </button>
            </div>
          </div>
        {:else if ui.view === 'ledger'}
          <LedgerView onpick={select} />
        {:else if ui.view === 'nest' && doc.people.length > 1}
          <NestView people={doc.people} onpick={select} />
        {:else if person}
          <Stage
            {person}
            oneditGarment={openGarment}
            oneditVitals={() => (modal = { kind: 'vitals' })}
            oneditPerson={() => (modal = { kind: 'person', person })}
          />
        {/if}
      </div>
    </main>
  </div>
</div>

{#if modal?.kind === 'person'}
  <PersonDialog person={modal.person} onclose={() => (modal = null)} />
{:else if modal?.kind === 'garment' && person}
  <GarmentDialog {person} regionId={modal.regionId} onclose={() => (modal = null)} />
{:else if modal?.kind === 'vitals' && person}
  <VitalsDialog {person} onclose={() => (modal = null)} />
{:else if modal?.kind === 'pod'}
  <PodDialog onclose={() => (modal = null)} />
{/if}

<!-- Two copies, both with real content. The person picks; nothing is merged
     behind their back. -->
{#if pod.incoming}
  <Dialog title="Two copies" kicker="Pod · {pod.webId ?? ''}" onclose={keepLocal}>
    {#snippet children()}
      <p style="margin:0;color:var(--chalk-2)">
        Your pod holds a copy that was changed more recently than the one in this
        browser. Only one can be kept.
      </p>
      <div class="row">
        <div class="field">
          <span class="eyebrow">On your pod</span>
          <p class="cmp">
            {pod.incoming.people.length} {pod.incoming.people.length === 1 ? 'person' : 'people'}<br />
            changed {fmtDate(pod.incoming.updatedAt)}
          </p>
        </div>
        <div class="field">
          <span class="eyebrow">On this device</span>
          <p class="cmp">
            {doc.people.length} {doc.people.length === 1 ? 'person' : 'people'}<br />
            changed {fmtDate(doc.updatedAt)}
          </p>
        </div>
      </div>
    {/snippet}
    {#snippet actions()}
      <span class="spacer"></span>
      <button class="btn" onclick={keepLocal}>Keep this device</button>
      <button class="btn primary" onclick={() => applyIncoming(pod.incoming)}>Use the pod copy</button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .cmp {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: var(--chalk);
  }
</style>
