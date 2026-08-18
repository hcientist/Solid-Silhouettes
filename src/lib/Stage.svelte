<script>
  import Figure from './Figure.svelte';
  import { REGIONS, chalkHex, hasSizes, latestHeight, latestWeight, doc } from './store.svelte.js';
  import { headline, details } from './describe.js';
  import { fmtLen, fmtMass, fmtHeight, fmtDate, fmtWhen, ageFrom } from './units.js';

  let {
    person,
    oneditGarment = () => {},
    oneditVitals = () => {},
    oneditPerson = () => {},
    onshare = () => {},
    canShare = false,
    readOnly = false,
    units = null
  } = $props();

  // A shared view carries its own units; it must not read the visitor's.
  const u = $derived(units ?? doc.units);

  let active = $state(null);

  const pc = $derived(chalkHex(person.chalk));
  const age = $derived(ageFrom(person.birthday));
  const h = $derived(latestHeight(person));
  const w = $derived(latestWeight(person));

  /* Height history, read the way marks on a door frame are read:
     newest at the top, each one measured against the last. */
  const marks = $derived.by(() => {
    const rows = person.vitals.slice(0, 6);
    return rows.map((v, i) => {
      const prev = person.vitals.slice(i + 1).find((x) => x.heightCm != null);
      const grew = v.heightCm != null && prev?.heightCm != null ? v.heightCm - prev.heightCm : null;
      const late = !v.approx && v.recordedAt && v.recordedAt.slice(0, 10) !== v.date;
      return { ...v, grew, late };
    });
  });
</script>

<div class="stage" style:--pc={pc}>
  <header class="stage-head">
    <h1 class="stage-name">{person.name}</h1>
    {#if !readOnly}
      <button class="tag" onclick={oneditPerson}>
        {#if age}<span>{age}</span><span class="rule"></span>{/if}
        edit
      </button>
    {:else if age}
      <span class="stage-meta">{age}</span>
    {/if}
    {#if canShare && !readOnly}
      <button class="tag" onclick={onshare} title="Give someone access to {person.name} alone">
        share
      </button>
    {/if}
  </header>

  <div class="figure-box">
    <Figure
      {person}
      {active}
      {readOnly}
      onactive={(id) => (active = id)}
      onpick={(id) => oneditGarment(id)}
    />
  </div>
</div>

<div class="specs" style:--pc={pc}>
  <p class="eyebrow" style="margin:2px 0 2px">Sizes on file</p>

  {#each REGIONS as region (region.id)}
    {@const record = person[region.id]}
    {@const v = headline(record, region)}
    {@const d = details(record, region, u)}
    <svelte:element
      this={readOnly ? 'div' : 'button'}
      class="spec"
      role={readOnly ? 'group' : undefined}
      aria-label={readOnly ? `${region.label} for ${person.name}` : undefined}
      class:readonly={readOnly}
      class:active={active === region.id}
      class:filled={hasSizes(person, region.id)}
      onclick={readOnly ? undefined : () => oneditGarment(region.id)}
      onpointerenter={() => (active = region.id)}
      onpointerleave={() => (active = null)}
      onfocus={() => (active = region.id)}
      onblur={() => (active = null)}
    >
      <span class="spec-key">{region.key}</span>
      <span>
        <span class="spec-label">{region.label}</span>
        <span class="spec-value" class:empty={!v}>{v ?? 'Not set'}</span>
        {#if d.length}
          <span class="spec-detail">
            {#each d as [label, val]}<span><b>{label}</b> {val}</span>{/each}
          </span>
        {:else}
          <span class="spec-detail"><b>{region.hint}</b></span>
        {/if}
      </span>
      <span class="spec-stamp">
        {#if record?.updated}
          {fmtWhen(record.updated)}
          {#if !readOnly && (record.revisions ?? []).length}
            <span class="revs">{record.revisions.length + 1} versions</span>
          {/if}
        {:else}
          {readOnly ? '—' : 'add'}
        {/if}
      </span>
    </svelte:element>
  {/each}

  {#if !readOnly || person.vitals.length}
  <section class="vitals">
    <div class="vitals-head">
      <span class="eyebrow">Vitals</span>
      {#if !readOnly}
        <button class="btn ghost" style="height:26px;padding:0 9px" onclick={oneditVitals}>Add reading</button>
      {/if}
    </div>

    <div class="vitals-now">
      <div>
        <span class="eyebrow">Height</span>
        <div class="n" class:empty={h == null}>{h == null ? 'not measured' : fmtHeight(h, u)}</div>
      </div>
      <div>
        <span class="eyebrow">Weight</span>
        <div class="n" class:empty={w == null}>{w == null ? 'not weighed' : fmtMass(w, u)}</div>
      </div>
    </div>

    {#if marks.length}
      <div class="doorframe">
        {#each marks as m (m.date)}
          <div class="mark">
            <span class="what">
              {m.heightCm != null ? fmtHeight(m.heightCm, u) : '—'}
              {#if m.weightKg != null}<span style="color:var(--chalk-3)"> · {fmtMass(m.weightKg, u)}</span>{/if}
              {#if m.grew > 0}<span class="delta"> +{fmtLen(m.grew, u)}</span>{/if}
              {#if (m.revisions ?? []).length}<span class="amended" title="Corrected after it was first entered">amended</span>{/if}
            </span>
            <span class="when">
              {fmtDate(m.date)}
              {#if m.late}<span class="entered">entered {fmtWhen(m.recordedAt)}</span>{/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
  {/if}
</div>

<style>
  .rule {
    width: 12px;
    height: 1px;
    background: currentColor;
    opacity: 0.4;
  }
  .vitals-now .eyebrow {
    display: block;
    margin-bottom: 5px;
  }
  .amended,
  .entered {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--chalk-3);
    margin-left: 7px;
  }
  .entered {
    display: block;
    margin: 2px 0 0;
  }
</style>
