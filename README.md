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

### Where in the pod

A pod is the person's storage, not the app's, so the app does not simply assume
a folder. On connecting it looks, in order:

1. **The profile's type index.** This is the Solid answer to "where does data of
   this kind live": the WebID points at an index document, and the index maps an
   RDF class to the resource holding it. If a `ss:Wardrobe` is registered, that
   is the location, no questions asked.
2. **Somewhere it already is** — a location remembered on this device, or the
   folder earlier versions used.
3. **Otherwise it asks**, prefilled with a suggestion, and registers the answer
   in the private type index so the next app — or this one on another device —
   can find it instead of guessing. If the profile has no type index at all, one
   is created at `settings/privateTypeIndex.ttl` and linked from the profile.

Finding the pod root itself is its own small problem: a profile *may* declare
`pim:storage`, but a fresh Community Solid Server pod does not. So discovery
falls back to walking up from the WebID document and taking the first container
whose `Link` header claims `pim:Storage`. Falling back to the WebID's origin
would hand back the whole server on a host that keeps many pods side by side.

### The layout on disk

```
<chosen folder>/
    wardrobe.ttl        index: units, when it changed, who is in it
    <person-id>.ttl     one document per person
```

One document per person is not tidiness. Access control in Solid is granted per
resource, so "let their optician read Devi's prescription, and nothing else" is
only expressible if Devi is a resource of her own.

- Sign-in is Solid-OIDC via `@inrupt/solid-client-authn-browser`. You are
  redirected to your own provider and back; this app never sees your password.
- Only the documents that actually changed are rewritten, so editing one person
  does not rewrite the household.
- A rewrite never deletes and recreates. Deleting would take the resource's ACL
  with it and silently revoke everything shared from that document.
- On connect, if both copies hold people and the pod's is more recent, you are
  asked which to keep. Nothing is merged behind your back.
- A person document the pod will not hand over is counted and reported rather
  than failing the whole read — you may have been given some and not others.
- A pod written by an earlier version still holds `wardrobe.json`, or a single
  `wardrobe.ttl` with everyone inside it. Both are read; the next save writes the
  split layout. The old files are left where they are.
- The Solid libraries are loaded lazily, only when you connect. A network problem
  or a provider outage cannot take the local app down with it.

## Sharing

Access is granted per resource to a WebID, so there are two scopes:

- **One person** — Share on their page. Writes access on that one document.
  Nobody else in the wardrobe comes with them.
- **Everyone** — Share from the pod dialog. Writes access on the container, the
  index, and every person document, so the grant is true rather than relying on
  a server's inheritance rules.

Read-only and edit are both offered, and both are revocable. The app reads the
current grants back from the pod rather than remembering what it set, so what
you see is what the server actually enforces. Granting does not notify anyone:
copy the address and send it however you like.

This uses `universalAccess` from `@inrupt/solid-client`, which speaks both WAC
and ACP. A server supporting neither will say so instead of failing quietly.

### A link anyone can open

Solid authorises by WebID. Someone with no pod has none, so there is no bearer
token to check and only one thing "viewable without signing in" can mean: the
document is public. **Create a link** therefore publishes a *separate* copy at

```
<chosen folder>/shared-<random uuid>.ttl
```

and grants public read on that one file. It sits beside the private records
rather than in a folder of its own because Nextcloud's Solid server refuses
writes into a subfolder the app creates; links made earlier under `shared/`
are still listed and kept fresh. The link is the capability — it is a
password in URL form, so anyone it reaches can read it, and it will sit in
browser histories and referrer headers like any other URL.

What that buys is precision about what leaks:

- The real person documents and the wardrobe index stay private. Only the copy
  is public, and it holds exactly what was shared.
- The folder is not public, so nobody can list the links.
- Height and weight are left out unless you tick the box, because the audience
  is "anyone at all".
- The copy is refreshed whenever the underlying records change, so a link does
  not quietly serve last month's sizes. Links are matched to people by id, not
  by name, so renaming someone does not orphan the link they are published in.
  A link whose content would not change is not rewritten.
- A link covers the people it was published for, and only those. Someone added
  to the wardrobe later does not appear in an existing link, including one
  created for "everyone" — a public link should never silently widen.
- **Removing someone withdraws what was published about them.** If a link
  covered only that person the file is deleted; if it covered several, they drop
  out and the rest stay. Deleting someone locally while a public copy of them
  carried on being readable would be the worst kind of quiet failure.
- Withdrawing a link deletes the file. There is nothing left to read.

Opening one puts the app in a view-only mode that reads that document and
nothing else — it does not connect a pod, and it does not read or write the
visitor's own wardrobe. That last part is deliberate: normalising and saving
their stored copy back would look harmless while moving its timestamp forward,
which could then win a conflict against their own pod.

## What is and is not verified

`test/` has the details. The RDF, the storage layout, and sharing are checked
against a real Community Solid Server: writing and reading over HTTP, one person
shared without leaking the others, read-only actually refusing writes, a rewrite
keeping its ACL, revocation, and the type index being created and then found by
a fresh client.

The public link is checked end to end against the same server, including the
part that matters: a plain unauthenticated fetch reads the link, while the same
fetch is refused the private records, the wardrobe index, the `shared/` listing,
and any attempt to write. A real browser then opens a published link in a
profile that already holds its own wardrobe, and that wardrobe comes out
byte-identical.

The browser sign-in is verified as far as the authorization code: a real Chrome
reaches the provider, logs in, consents, and returns to the app with a code. The
token exchange after that fails against Community Solid Server 7, which rejects
the auth library's dynamic client registration with
`invalid_redirect_uri: redirect_uris must only contain strings`. The same code
registers successfully against solidcommunity.net. Whether this is a bug in the
library, in the server, or in how this app calls it is unresolved — treat
browser sign-in against a local CSS as untested.

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
    typeindex.js          finding and registering the location in the pod
    viewer.svelte.js      state for a shared link; never touches the store
    Viewer.svelte         the read-only shell a link opens into
    mode.js               decided before anything else: is this a shared view?
    ShareDialog.svelte    granting and revoking access by WebID
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
