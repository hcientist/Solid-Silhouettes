<script>
  import Dialog from './Dialog.svelte';
  import { doc, addVitals, removeVitals, latestHeight, latestWeight } from './store.svelte.js';
  import {
    todayISO,
    lenIn,
    massIn,
    lenOut,
    massOut,
    lenUnit,
    massUnit,
    fmtDate,
    fmtHeight,
    fmtMass
  } from './units.js';

  let { person, onclose } = $props();

  let form = $state({ date: todayISO(), height: '', weight: '' });

  const lastH = $derived(latestHeight(person));
  const lastW = $derived(latestWeight(person));
  const valid = $derived(form.height !== '' || form.weight !== '');

  function save() {
    if (!valid) return;
    addVitals(person.id, {
      date: form.date,
      heightCm: form.height === '' ? null : lenIn(form.height, doc.units),
      weightKg: form.weight === '' ? null : massIn(form.weight, doc.units)
    });
    onclose();
  }
</script>

<Dialog title="Add reading" kicker="Vitals · {person.name}" {onclose}>
  {#snippet children()}
    <div class="row">
      <div class="field">
        <label for="v-h">Height</label>
        <div class="suffixed">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="v-h"
            type="number"
            step="0.1"
            inputmode="decimal"
            autofocus
            bind:value={form.height}
            placeholder={lastH != null ? String(lenOut(lastH, doc.units)) : ''}
          />
          <span class="suffix">{lenUnit(doc.units)}</span>
        </div>
      </div>
      <div class="field">
        <label for="v-w">Weight</label>
        <div class="suffixed">
          <input
            id="v-w"
            type="number"
            step="0.1"
            inputmode="decimal"
            bind:value={form.weight}
            placeholder={lastW != null ? String(massOut(lastW, doc.units)) : ''}
          />
          <span class="suffix">{massUnit(doc.units)}</span>
        </div>
      </div>
    </div>

    <div class="field">
      <label for="v-d">Measured on</label>
      <input id="v-d" type="date" bind:value={form.date} max={todayISO()} />
      <p class="hint">
        Fill in either box, or both. A second reading on the same date replaces the
        first.
      </p>
    </div>

    {#if person.vitals.length}
      <div class="field">
        <span class="eyebrow">On file</span>
        <ul class="history">
          {#each person.vitals as v (v.date)}
            <li>
              <span class="mono">{fmtDate(v.date)}</span>
              <span class="mono vals">
                {v.heightCm != null ? fmtHeight(v.heightCm, doc.units) : '—'}
                ·
                {v.weightKg != null ? fmtMass(v.weightKg, doc.units) : '—'}
              </span>
              <button
                class="btn ghost"
                style="height:24px;padding:0 7px;font-size:10px"
                onclick={() => removeVitals(person.id, v.date)}
                aria-label="Remove the reading from {fmtDate(v.date)}">Remove</button
              >
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/snippet}

  {#snippet actions()}
    <span class="spacer"></span>
    <button class="btn" onclick={onclose}>Cancel</button>
    <button class="btn primary" onclick={save} disabled={!valid}>Save reading</button>
  {/snippet}
</Dialog>

<style>
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 168px;
    overflow-y: auto;
    border: 1px solid var(--mat-edge);
    border-radius: 2px;
  }
  .history li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 8px 6px 10px;
    font-size: 11.5px;
    color: var(--chalk-2);
    border-bottom: 1px solid var(--chalk-line);
  }
  .history li:last-child {
    border-bottom: 0;
  }
  .history .vals {
    color: var(--chalk);
  }
</style>
