<script>
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';
  import { doc, regionById, saveGarment, versionsOf, EYES, RX_FIELDS } from './store.svelte.js';
  import { oneLine } from './describe.js';
  import { lenOut, lenIn, lenUnit, fmtDate, fmtWhen } from './units.js';

  let { person, regionId, onclose } = $props();

  // A dialog is mounted fresh each time it opens, so the form is a snapshot
  // of what was on file at that moment and stays put while it's being edited.
  const region = untrack(() => regionById(regionId));
  const g = untrack(() => person[regionId] ?? {});

  let form = $state(
    untrack(() => {
      const f = {
        size: g.size ?? '',
        brand: g.brand ?? '',
        note: g.note ?? ''
      };
      for (const fd of region.fields) {
        f[fd.k] =
          fd.kind === 'length' ? lenOut(g[fd.k], doc.units) : g[fd.k] ?? fd.options?.[0] ?? '';
      }
      if (region.rx) for (const e of EYES) f[e.k] = { ...(g[e.k] ?? {}) };
      return f;
    })
  );

  let showHistory = $state(false);
  const past = $derived(versionsOf(person[regionId], region).filter((v) => !v.current));

  const blank = (v) => v === '' || v == null;

  function collect() {
    const values = { size: form.size.trim(), brand: form.brand.trim(), note: form.note.trim() };
    for (const f of region.fields) {
      if (f.kind === 'length') values[f.k] = lenIn(form[f.k], doc.units);
      else if (f.kind === 'mm') values[f.k] = blank(form[f.k]) ? null : Number(form[f.k]);
      else values[f.k] = String(form[f.k] ?? '').trim();
    }
    if (region.rx) {
      for (const e of EYES) {
        values[e.k] = Object.fromEntries(
          RX_FIELDS.map((f) => [f.k, blank(form[e.k][f.k]) ? null : Number(form[e.k][f.k])])
        );
      }
    }
    return values;
  }

  function save() {
    saveGarment(person.id, regionId, collect());
    onclose();
  }

  function clear() {
    const values = { size: '', brand: '', note: '' };
    for (const f of region.fields) values[f.k] = f.kind === 'choice' ? f.options[0] : f.kind === 'text' || f.kind === 'date' ? '' : null;
    if (region.rx) for (const e of EYES) values[e.k] = { sph: null, cyl: null, axis: null, add: null };
    saveGarment(person.id, regionId, values);
    onclose();
  }
</script>

<Dialog title={region.verb} kicker="{region.key} · {person.name}" {onclose}>
  {#snippet children()}
    <div class="field">
      <label for="g-size">{region.sizeLabel ?? 'Size on the label'}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="g-size"
        type="text"
        bind:value={form.size}
        placeholder={region.sizeHint}
        autocomplete="off"
        autofocus
      />
    </div>

    <div class="row-fields">
      {#each region.fields as f (f.k)}
        <div class="field">
          <label for="g-{f.k}">{f.label}</label>
          {#if f.kind === 'length' || f.kind === 'mm'}
            <div class="suffixed">
              <input id="g-{f.k}" type="number" step={f.kind === 'mm' ? '0.5' : '0.1'} inputmode="decimal" bind:value={form[f.k]} />
              <span class="suffix">{f.kind === 'mm' ? 'mm' : lenUnit(doc.units)}</span>
            </div>
          {:else if f.kind === 'date'}
            <input id="g-{f.k}" type="date" bind:value={form[f.k]} />
          {:else if f.kind === 'choice'}
            <select id="g-{f.k}" bind:value={form[f.k]}>
              {#each f.options as o}<option value={o}>{o}</option>{/each}
            </select>
          {:else}
            <input id="g-{f.k}" type="text" bind:value={form[f.k]} placeholder={f.placeholder ?? ''} />
          {/if}
        </div>
      {/each}
    </div>

    {#if region.rx}
      <!-- Laid out the way the script is written, so it can be copied across
           a row at a time without translating anything. -->
      <fieldset class="rx">
        <legend>Prescription</legend>
        <div class="rx-grid" style="--cols:{RX_FIELDS.length}">
          <span></span>
          {#each RX_FIELDS as f (f.k)}<span class="rx-head">{f.label}</span>{/each}
          {#each EYES as e (e.k)}
            <span class="rx-eye" title={e.label}>{e.short}</span>
            {#each RX_FIELDS as f (f.k)}
              <input
                type="number"
                step={f.step}
                inputmode="decimal"
                aria-label="{e.label} {f.label}"
                bind:value={form[e.k][f.k]}
              />
            {/each}
          {/each}
        </div>
        <p class="hint">
          OD is the right eye, OS the left. Leave a box empty if the script does
          not give it.
        </p>
      </fieldset>
    {/if}

    <div class="field">
      <label for="g-brand">Brand that fits</label>
      <input id="g-brand" type="text" bind:value={form.brand} placeholder="Uniqlo, Warby Parker…" autocomplete="off" />
    </div>

    <div class="field">
      <label for="g-note">Note</label>
      <textarea id="g-note" bind:value={form.note} placeholder={region.notePlaceholder}></textarea>
    </div>

    {#if g.updated}
      <div class="field">
        <div class="hist-head">
          <p class="hint" style="margin:0">Last changed {fmtWhen(g.updated)}.</p>
          {#if past.length}
            <button class="btn ghost" style="height:24px;padding:0 8px;font-size:10px" onclick={() => (showHistory = !showHistory)}>
              {showHistory ? 'Hide' : `${past.length} earlier`}
            </button>
          {/if}
        </div>
        {#if showHistory && past.length}
          <ol class="history">
            {#each past as v (v.at)}
              <li>
                <span class="when">{fmtDate(v.at)}</span>
                <span class="what">{oneLine(v.values, region, doc.units)}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if g.updated}
      <button class="btn danger" onclick={clear}>Clear</button>
    {/if}
    <span class="spacer"></span>
    <button class="btn" onclick={onclose}>Cancel</button>
    <button class="btn primary" onclick={save}>Save {region.label.toLowerCase()}</button>
  {/snippet}
</Dialog>
