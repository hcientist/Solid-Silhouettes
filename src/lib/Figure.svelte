<script>
  import { VIEW, PIECES, NECK, SPECTACLES, GRAINLINE, NOTCHES, FLOOR, KEYS } from './figure.js';
  import { REGIONS, chalkHex, hasSizes } from './store.svelte.js';

  let { person, active = null, onactive = () => {}, onpick = () => {} } = $props();

  const pc = $derived(chalkHex(person.chalk));
  const filled = $derived(Object.fromEntries(REGIONS.map((r) => [r.id, hasSizes(person, r.id)])));

  const delayClass = { glasses: 'd1', shirt: 'd2', pants: 'd3', shoes: 'd4' };

  function keydown(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onpick(id);
    }
  }
</script>

<svg
  class="figure-svg"
  viewBox="0 0 {VIEW.w} {VIEW.h}"
  style:--pc={pc}
  role="group"
  aria-label="{person.name}, drawn as four pattern pieces"
>
  <defs>
    <!-- Chalk is not a pen. Roughen every edge a little. -->
    <filter id="chalkgrain" x="-8%" y="-6%" width="116%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="9" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>

  <!-- chalk dust settles around whatever you're working on -->
  <g aria-hidden="true">
    {#each REGIONS as r (r.id)}
      <path class="dust" class:active={active === r.id} d={PIECES[r.id]} />
    {/each}
  </g>

  {#key person.id}
    <g class="drawing" aria-hidden="true" style="pointer-events:none">
      <g filter="url(#chalkgrain)">
        <path class="ink ink-faint" pathLength="1" d={FLOOR} />
        <path class="ink ink-faint" pathLength="1" d={NECK} />

        {#each REGIONS as r (r.id)}
          <path
            class="ink region-ink {delayClass[r.id]}"
            class:filled={filled[r.id]}
            class:active={active === r.id}
            pathLength="1"
            d={PIECES[r.id]}
          />
        {/each}

        <path class="ink ink-faint d2" pathLength="1" d={NOTCHES} />

        <!-- once there is a prescription on file, the figure wears it -->
        {#if filled.glasses}
          <path class="ink region-ink filled spectacles d1" pathLength="1" d={SPECTACLES} />
        {/if}
      </g>

      <!-- every pattern piece carries a grainline; this one runs centre front -->
      <path class="ink ink-faint grain-arrow" pathLength="1" d={GRAINLINE} filter="url(#chalkgrain)" />

      <!-- keyed letters, the way a tech pack keys a drawing to its spec table -->
      {#each REGIONS as r (r.id)}
        {@const k = KEYS[r.id]}
        <g class="key-mark" class:active={active === r.id}>
          <path class="lead" d="M {k.from[0]} {k.from[1]} L {k.at[0] - 12} {k.at[1]}" />
          <circle cx={k.at[0]} cy={k.at[1]} r="9" />
          <text x={k.at[0]} y={k.at[1] + 4}>{r.key}</text>
        </g>
      {/each}
    </g>
  {/key}

  <!-- Hit targets sit above the drawing so a click anywhere on a piece
       opens that piece's sizes. Kept out of the keyed block so focus
       survives a change of person. -->
  <g>
    {#each REGIONS as r (r.id)}
      <path
        class="hit"
        d={PIECES[r.id]}
        role="button"
        tabindex="0"
        aria-label="{r.verb} for {person.name}"
        onclick={() => onpick(r.id)}
        onkeydown={(e) => keydown(e, r.id)}
        onpointerenter={() => onactive(r.id)}
        onpointerleave={() => onactive(null)}
        onfocus={() => onactive(r.id)}
        onblur={() => onactive(null)}
      />
      <path class="hit-ring" d={PIECES[r.id]} aria-hidden="true" />
    {/each}
  </g>
</svg>
