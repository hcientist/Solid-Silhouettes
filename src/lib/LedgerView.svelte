<script>
  /* The job book. Every value any record has ever held, newest first, so
     "when did we last buy Devi shoes" is one glance rather than four. */
  import { ledger, chalkHex, doc } from './store.svelte.js';
  import { oneLine } from './describe.js';
  import { fmtDate, fmtHeight, fmtMass } from './units.js';

  let { onpick } = $props();

  const rows = $derived(ledger());

  const days = $derived.by(() => {
    const out = [];
    for (const r of rows) {
      const day = (r.at ?? '').slice(0, 10);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  });

  /* Imported readings carry a date but no entry time. Showing "8:00 am"
     for those would be inventing precision that was never recorded. */
  const time = (r) => {
    if (r.approx) return '—';
    const d = new Date(r.at);
    return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  function label(r) {
    if (r.kind === 'person') return 'Person';
    if (r.kind === 'vitals') return 'Reading';
    return r.region.label;
  }

  function text(r) {
    if (r.kind === 'person') return r.values.name;
    if (r.kind === 'vitals') {
      const bits = [];
      if (r.values.heightCm != null) bits.push(fmtHeight(r.values.heightCm, doc.units));
      if (r.values.weightKg != null) bits.push(fmtMass(r.values.weightKg, doc.units));
      return bits.length ? bits.join(' · ') : 'cleared';
    }
    return oneLine(r.values, r.region, doc.units);
  }
</script>

<div class="ledger">
  <header class="stage-head" style="margin-bottom:18px">
    <h1 class="stage-name">Ledger</h1>
    <span class="stage-meta">
      {rows.length}
      {rows.length === 1 ? 'entry' : 'entries'} · newest first
    </span>
  </header>

  {#if !rows.length}
    <p class="nest-note" style="border:0;padding:0;max-width:44ch">
      Nothing has been written down yet. Every size, reading and prescription you
      save keeps the value it replaced, and they all show up here.
    </p>
  {:else}
    {#each days as d (d.day)}
      <section class="day">
        <h2 class="day-head">
          <span>{fmtDate(d.day)}</span>
          <span class="hair"></span>
        </h2>
        <ol class="entries">
          {#each d.rows as r, i (r.kind + r.at + r.personId + i)}
            <li>
              <button class="entry" style:--pc={chalkHex(r.chalk)} onclick={() => onpick(r.personId)}>
                <span class="at" class:vague={r.approx}>{time(r)}</span>
                <span class="who"><span class="swatch"></span>{r.person}</span>
                <span class="kind">{label(r)}</span>
                <span class="val">
                  {text(r)}
                  {#if r.kind === 'vitals' && r.on !== (r.at ?? '').slice(0, 10)}
                    <span class="on">measured {fmtDate(r.on)}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {/if}
</div>

<style>
  .ledger {
    grid-column: 1 / -1;
    max-width: 860px;
    width: 100%;
  }

  .day {
    margin-bottom: 22px;
  }

  .day-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 4px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--chalk-3);
  }
  .day-head .hair {
    flex: 1;
    height: 1px;
    background: var(--chalk-line);
  }

  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .entry {
    display: grid;
    grid-template-columns: 68px 132px 74px 1fr;
    gap: 14px;
    align-items: baseline;
    width: 100%;
    padding: 8px 10px 8px 4px;
    border: 0;
    border-bottom: 1px solid var(--chalk-line);
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.16s var(--ease);
  }
  .entry:hover {
    background: var(--mat-raise);
  }

  .at.vague {
    opacity: 0.45;
  }
  .at {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--chalk-3);
    font-variant-numeric: tabular-nums;
  }

  .who {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 17px;
    text-transform: uppercase;
    line-height: 1;
    color: var(--chalk);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who .swatch {
    flex: none;
    width: 3px;
    height: 13px;
    border-radius: 2px;
    background: var(--pc);
    transform: translateY(1px);
  }

  .kind {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--chalk-3);
  }

  .val {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--chalk-2);
    overflow-wrap: anywhere;
  }
  .val .on {
    color: var(--chalk-3);
    margin-left: 8px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 780px) {
    .entry {
      grid-template-columns: 56px 1fr;
      row-gap: 4px;
      padding-bottom: 10px;
    }
    .kind {
      grid-column: 2;
    }
    .val {
      grid-column: 2;
    }
  }
</style>
