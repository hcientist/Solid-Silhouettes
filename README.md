# SolidSilhouettes

Clothing sizes, prescriptions and vitals for everyone in the house. Each person
is drawn as an outlined figure made of four pattern pieces — click the **head**
for glasses, the **torso** for shirt sizes, the **legs** for pants, the **feet**
for shoes. Every record keeps the values it used to hold, and the date each one
changed. Data lives in this browser by default, and on your
[Solid pod](https://solidproject.org/) as RDF if you connect one.

```
bun install
bun run dev      # http://localhost:5273
bun run build    # static output in dist/
```

Svelte 5 (runes) + Vite. No backend.

## The design

The whole app is set on a cutting table: a self-healing mat, tailor's chalk, a
tape measure. That is not decoration — it is where the interface language comes
from.

- **The figure is a set of pattern pieces**, not one body. The pieces meet at
  seams, which is exactly where a garment changes hands, so the seam between the
  torso piece and the leg piece is the same line as the one between "shirt" and
  "pants". Each piece carries a grainline arrow and notches, like a real pattern.
- **Callouts are keyed A / B / C / D**, read down the figure, the way a tech pack
  keys a drawing to a spec table beside it. Clicking either the letter on the
  figure or its card opens the same editor.
- **A face with a prescription on file wears spectacles.** The drawing reflects
  what is recorded rather than decorating everyone alike.
- **Every person gets a chalk colour** from a tailor's chalk triangle set. The
  same colour keys them in the roster, their silhouette, the nest and the ledger.
- **Nest** is the signature view. A commercial sewing pattern prints every size
  on one sheet, nested, each size told apart by its line style. A family is the
  same drawing, graded: each silhouette is scaled to the last height on file and
  stood on a shared floor line, so the gaps between them are real.
- **Height history reads like marks on a door frame** — newest at the top, each
  one measured against the last.

## Units

Lengths are stored metric and converted for display; imperial prints in tailor's
notation (`38½″`) and heights in feet and inches.

Optical measurements ignore the unit toggle, because they are millimetres and
dioptres the world over. A PD is never quoted in inches. Prescriptions are shown
the way an optician writes them — `-2.25 -0.75 ×180`, axis padded to three
digits, `plano` for a zero sphere — so a row can be copied straight off the
script and straight back onto an order form.

## History

Every record — a garment, a person's own details, a reading — holds its current
values plus the values it used to hold. A revision's timestamp is the moment that
value *became* current, so a record reads as a run of "this was true from then
until the next one". Saving an unchanged form is a no-op; nothing is versioned
that did not actually change. The last 24 revisions per record are kept.

It surfaces in three places:

- the date on each spec card, plus a version count when there is history,
- a **Previously** list inside each editor, and
- the **Ledger**: every version of everything, newest first, grouped by day and
  keyed by chalk colour. Click a row to jump to that person.

A reading distinguishes when it was *measured* from when it was *entered*, so a
late entry or a correction is visible rather than silently overwriting. Readings
imported from an older file have no entry time; the ledger prints `—` rather than
inventing a clock time for them.

## Where the data goes

`localStorage` under `solidsilhouettes.doc.v1`, always. That copy is what makes
the app work offline, and it is the only copy until you connect a pod.

Connecting a pod adds a second home for the same document, as Turtle:

```
<your pod>/solidsilhouettes/wardrobe.ttl
```

- Sign-in is Solid-OIDC via `@inrupt/solid-client-authn-browser`. You are
  redirected to your own provider and back; this app never sees your password.
  Sessions are restored on reload.
- The pod URL comes from `pim:storage` in your WebID profile, falling back to the
  origin of the WebID if the profile does not advertise one.
- Local edits are pushed automatically, debounced to about a second, so a burst
  of typing is one write.
- On connect, if both copies hold people and the pod's is more recent, you are
  asked which to keep. Nothing is merged behind your back.
- A pod written by an earlier version still holds `wardrobe.json`. It is read in
  once and the next save writes Turtle; the old file is left where it is.
- The Solid libraries are loaded lazily, only when you connect. A network problem
  or a provider outage cannot take the local app down with it.

`ISSUERS` in `src/lib/solid.svelte.js` lists the providers offered, including
`https://localhost:8443` for a local `node-solid-server`. Any provider address
can be typed in instead.

### The RDF

Everything is a named node — no blank nodes — so a revision or a prescription can
be linked to, quoted and patched on its own. Where a published vocabulary says
the thing plainly it is used (`vcard:fn`, `vcard:bday`, `dcterms:modified`); the
rest is minted under `https://solidsilhouettes.app/ns#`, with the unit baked into
the predicate so a number never needs a companion triple to be read correctly.

```turtle
<>  a ss:Wardrobe ; ss:units "metric" ; ss:wearer <#p1> .

<#p1> a ss:Wearer, vcard:Individual ;
    vcard:fn "Devi" ; vcard:bday "2016-09-22"^^xsd:date ; ss:chalk "rose" ;
    ss:garment <#p1-glasses> ; ss:reading <#p1-v-2026-08-01> .

<#p1-glasses> a ss:Garment, ss:Eyewear ;
    ss:piece "glasses" ; ss:labelSize "46-16-125" ; ss:pdMm 54.5 ;
    ss:prescribedOn "2026-02-10"^^xsd:date ;
    ss:rightEye <#p1-glasses-od> ; ss:leftEye <#p1-glasses-os> ;
    dcterms:modified "2026-02-11T17:04:00Z"^^xsd:dateTime ;
    ss:priorVersion <#p1-glasses-h0> .

<#p1-glasses-od> a ss:Prescription ;
    ss:sphere -1.75 ; ss:cylinder -0.5 ; ss:axis 175 .
```

A revision node carries the same predicates as the record it belongs to, plus a
`dcterms:date`, so one writer handles both. On a reading, the *absence* of
`dcterms:created` is what means "no entry time was ever recorded".

That namespace is minted by this app and is not dereferenceable. Anything that
maps cleanly onto a published vocabulary should move to one.

## Layout

```
src/
  App.svelte              shell: rail, roster, table, dialogs
  app.css                 tokens and every shared surface
  lib/
    regions.js            the record schema — pieces, fields, chalk set
    figure.js             the pattern-piece path data and markings
    Figure.svelte         one silhouette, with clickable regions
    NestView.svelte       the graded overlay + size key
    LedgerView.svelte     every version of everything, by day
    Stage.svelte          one person: figure, spec cards, vitals
    store.svelte.js       the document, versioning, localStorage
    rdf.js                Turtle in and out (no runes; unit-testable)
    describe.js           records into words, for cards/history/ledger
    solid.svelte.js       pod auth and sync
    units.js              metric storage, imperial and optical display
    Dialog.svelte         shared modal shell
    {Person,Garment,Vitals,Pod}Dialog.svelte
```

Adding a fifth clickable region is one entry in `REGIONS` (`regions.js`), one
path in `PIECES` and one entry in `KEYS` (`figure.js`). The editor dialog, the
spec card, the roster summary, the ledger and the RDF all read from that
declaration — `rdf.js` maps an unknown field key to `ss:<key>` automatically.
