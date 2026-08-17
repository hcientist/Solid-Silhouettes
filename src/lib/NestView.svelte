<script>
  /* The signature view. A commercial sewing pattern prints every size on
     one sheet, nested inside each other, each size told apart by its line
     style. A family is the same drawing: one shape, graded. */
  import { VIEW, OUTLINE, FLOOR, GRADE_DASHES, scaleFor, standOn } from './figure.js';
  import { chalkHex, latestHeight, specLine } from './store.svelte.js';
  import { doc } from './store.svelte.js';
  import { fmtHeight } from './units.js';

  let { people, onpick } = $props();

  let lit = $state(null);

  const heights = $derived(people.map((p) => latestHeight(p)));
  const graded = $derived(heights.some((h) => h != null));
  const tallest = $derived(Math.max(168, ...heights.filter((h) => h != null)));

  /* Tallest to the back, so the smallest silhouette stays readable in front */
  const ordered = $derived(
    people
      .map((p, i) => ({ p, dash: GRADE_DASHES[i % GRADE_DASHES.length], h: latestHeight(p) }))
      .sort((a, b) => (b.h ?? 168) - (a.h ?? 168))
  );

</script>

<div class="stage">
  <header class="stage-head">
    <h1 class="stage-name">Nested</h1>
    <span class="stage-meta">{people.length} sizes · one sheet</span>
  </header>

  <div class="figure-box">
    <svg class="figure-svg" viewBox="0 0 {VIEW.w} {VIEW.h}" role="img"
      aria-label="Every family member's silhouette overlaid and scaled to their height">
      <path class="ink ink-faint" d={FLOOR} />
      {#each ordered as { p, dash, h } (p.id)}
        <g
          transform={standOn(graded ? scaleFor(h, tallest) : 1)}
          style:--gc={chalkHex(p.chalk)}
          class="grade"
          class:lit={lit === p.id}
          class:dimmed={lit && lit !== p.id}
        >
          <path d={OUTLINE} stroke-dasharray={dash} />
        </g>
      {/each}
    </svg>
  </div>
</div>

<div class="specs">
  <p class="eyebrow" style="margin:2px 0 2px">Size key</p>

  <div class="nest-legend">
    {#each ordered as { p, dash, h } (p.id)}
      <button
        class="nest-row"
        onclick={() => onpick(p.id)}
        onpointerenter={() => (lit = p.id)}
        onpointerleave={() => (lit = null)}
        onfocus={() => (lit = p.id)}
        onblur={() => (lit = null)}
      >
        <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
          <path
            d="M 1 6 L 43 6"
            fill="none"
            stroke={chalkHex(p.chalk)}
            stroke-width="2"
            stroke-dasharray={dash}
          />
        </svg>
        <span>
          <span class="nname">{p.name}</span>
          <span class="nsize" style="display:block;margin-top:4px">{specLine(p)}</span>
        </span>
        <span class="nsize">{h != null ? fmtHeight(h, doc.units) : '—'}</span>
      </button>
    {/each}
  </div>

  <p class="nest-note">
    {#if graded}
      Each silhouette is scaled to the last height on file and stood on the same
      floor line, so the gaps between them are real.
    {:else}
      Everyone is drawn the same size because no heights are recorded yet. Add a
      height reading to anyone and the nest starts grading itself.
    {/if}
  </p>
</div>

<style>
  .grade path {
    fill: none;
    stroke: var(--gc);
    stroke-width: 1.4;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    opacity: 0.82;
    transition: opacity 0.2s var(--ease), stroke-width 0.2s var(--ease);
  }
  .grade.lit path {
    opacity: 1;
    stroke-width: 2.4;
  }
  .grade.dimmed path {
    opacity: 0.22;
  }
</style>
