<script>
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';
  import { CHALKS, doc, addPerson, removePerson, blankPerson, savePerson } from './store.svelte.js';
  import { fmtDate, fmtWhen } from './units.js';

  let { person = null, onclose } = $props();

  // Snapshot on open: see the note in GarmentDialog.
  const isNew = untrack(() => person === null);
  const takenChalks = new Set(doc.people.filter((p) => p.id !== person?.id).map((p) => p.chalk));
  const firstFree = CHALKS.find((c) => !takenChalks.has(c.id)) ?? CHALKS[0];

  let form = $state(
    untrack(() => ({
      name: person?.name ?? '',
      birthday: person?.birthday ?? '',
      chalk: person?.chalk ?? firstFree.id
    }))
  );
  let confirming = $state(false);

  const valid = $derived(form.name.trim().length > 0);

  function save() {
    if (!valid) return;
    if (isNew) {
      const p = blankPerson(form.name.trim(), form.chalk);
      p.birthday = form.birthday;
      addPerson(p);
    } else {
      savePerson(person.id, {
        name: form.name.trim(),
        birthday: form.birthday,
        chalk: form.chalk
      });
    }
    onclose();
  }
</script>

<Dialog
  title={isNew ? 'Add person' : 'Edit person'}
  kicker={isNew ? 'New pattern piece' : person.name}
  {onclose}
>
  {#snippet children()}
    <div class="field">
      <label for="p-name">Name</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="p-name"
        type="text"
        bind:value={form.name}
        placeholder="Who is this?"
        autocomplete="off"
        autofocus={isNew}
        onkeydown={(e) => e.key === 'Enter' && save()}
      />
    </div>

    <div class="field">
      <label for="p-bday">Birthday</label>
      <input id="p-bday" type="date" bind:value={form.birthday} />
      <p class="hint">Optional. Only used to show an age next to their name.</p>
    </div>

    <fieldset class="field fieldset" style="border:0;padding:0;margin:0">
      <legend>Chalk</legend>
      <div class="chalks">
        {#each CHALKS as c (c.id)}
          <button
            type="button"
            style:--sw={c.hex}
            aria-pressed={form.chalk === c.id}
            aria-label={c.id}
            onclick={() => (form.chalk = c.id)}
          ></button>
        {/each}
      </div>
      <p class="hint">Their colour on the roster, the silhouette and the nest.</p>
    </fieldset>

    {#if !isNew && (person.revisions ?? []).length}
      <div class="field">
        <span class="eyebrow">Renamed and recoloured</span>
        <ol class="history">
          {#each person.revisions as r (r.at)}
            <li>
              <span class="when">{fmtDate(r.at)}</span>
              <span class="what">{r.name}{r.birthday ? ` · born ${fmtDate(r.birthday)}` : ''}</span>
            </li>
          {/each}
        </ol>
      </div>
    {/if}

    {#if !isNew}
      <p class="hint">Added {fmtWhen(person.added)}. Last changed {fmtWhen(person.updated)}.</p>
    {/if}

    {#if confirming}
      <div class="notice">
        Deleting {person.name} removes their sizes, their prescription and every
        reading on file. This cannot be undone.
      </div>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if !isNew}
      {#if confirming}
        <button
          class="btn danger"
          onclick={() => {
            removePerson(person.id);
            onclose();
          }}>Delete for good</button
        >
        <button class="btn ghost" onclick={() => (confirming = false)}>Keep</button>
      {:else}
        <button class="btn danger" onclick={() => (confirming = true)}>Delete</button>
      {/if}
    {/if}
    <span class="spacer"></span>
    <button class="btn" onclick={onclose}>Cancel</button>
    <button class="btn primary" onclick={save} disabled={!valid}>
      {isNew ? 'Add to the table' : 'Save'}
    </button>
  {/snippet}
</Dialog>
