import { doc, snapshot, replaceDoc, watchDoc } from './store.svelte.js';

/* A pod is optional. The app is fully usable without one, so the Solid
   libraries are only fetched when someone actually connects — which also
   means a broken network never takes the local app down with it. */

const WANTED = 'solidsilhouettes.pod.wanted';
const LOCATION = 'solidsilhouettes.pod.location';
const SYNCED = 'solidsilhouettes.pod.synced';
const PERSON_DOC = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ttl$/i;
const INDEX_FILE = 'wardrobe.ttl';
/** Written by versions before the move to RDF; read once, then left alone. */
const LEGACY_FILE = 'wardrobe.json';
const DEFAULT_DIR = 'solidsilhouettes/';
/** Public read-only copies sit beside the private records, named apart from
    them. They used to have a folder of their own, and links made then are
    still listed, but Nextcloud's Solid server will not write into a
    subfolder the app creates, and a file in a folder that already works
    needs nothing new from the server. */
const SHARE_PREFIX = 'shared-';
const LEGACY_SHARE_DIR = 'shared/';

export const ISSUERS = [
  { who: 'Solid Community', url: 'https://solidcommunity.net' },
  { who: 'Inrupt Pod Spaces', url: 'https://login.inrupt.com' },
  { who: 'solidweb.org', url: 'https://solidweb.org' },
  { who: 'Local node-solid-server', url: 'https://localhost:8443' }
];

export const pod = $state({
  /** off | connecting | on | error */
  state: 'off',
  webId: null,
  podUrl: null,
  /** the container everything lives in, and the index inside it */
  base: null,
  indexUrl: null,
  legacyUrl: null,
  /** true when we have nowhere to write yet and must ask */
  needsLocation: false,
  suggested: null,
  /** how the location was settled: type-index | existing | chosen */
  foundVia: null,
  /** result of writing the type index registration */
  registered: null,
  error: null,
  syncing: false,
  lastSync: null,
  /** person documents the pod would not hand over */
  unreadable: 0,
  /** true when what we read came from a pre-RDF JSON document */
  migrated: false,
  /** public read-only links currently published */
  viewLinks: [],
  /** set when the pod holds a newer copy than this device */
  incoming: null,
  /** false when this WebID may read the wardrobe but not change its list */
  indexWritable: true
});

let authn = null;
let client = null;
let rdf = null;
let typeindex = null;

async function libs() {
  if (!authn) {
    [authn, client, rdf, typeindex] = await Promise.all([
      import('@inrupt/solid-client-authn-browser'),
      import('@inrupt/solid-client'),
      import('./rdf.js'),
      import('./typeindex.js')
    ]);
  }
  return { authn, client, rdf, typeindex };
}

const redirectUrl = () => window.location.origin + window.location.pathname;
const asContainer = (url) => url.replace(/\/?$/, '/');

/** Run once on load: finishes a redirect, or restores a live session. */
export async function bootPod() {
  const params = new URLSearchParams(window.location.search);
  const returning = params.has('code') || params.has('error');
  if (!returning && localStorage.getItem(WANTED) !== '1') return;

  pod.state = 'connecting';
  try {
    const { authn } = await libs();
    // Completing a fresh sign-in and restoring an old one are different jobs.
    // Asking for both at once makes the library attempt a silent re-auth
    // alongside the code exchange, which needs a client registration it no
    // longer has.
    if (returning) await authn.handleIncomingRedirect();
    else await authn.handleIncomingRedirect({ restorePreviousSession: true });
    if (returning) window.history.replaceState({}, '', redirectUrl());
    const info = authn.getDefaultSession().info;
    if (info.isLoggedIn) await afterLogin(info.webId);
    else {
      pod.state = 'off';
      localStorage.removeItem(WANTED);
    }
  } catch (err) {
    fail(err, 'Could not restore the pod session.');
  }
}

export async function connect(issuerUrl) {
  const url = (issuerUrl || '').trim();
  if (!url) return;
  pod.error = null;
  pod.state = 'connecting';
  localStorage.setItem(WANTED, '1');
  try {
    const { authn } = await libs();
    await authn.login({ oidcIssuer: url, redirectUrl: redirectUrl(), clientName: 'SolidSilhouettes' });
    // The browser navigates away here.
  } catch (err) {
    localStorage.removeItem(WANTED);
    fail(err, `${url} did not accept the sign-in. Check the address and try again.`);
  }
}

export async function disconnect() {
  localStorage.removeItem(WANTED);
  try {
    const { authn } = await libs();
    await authn.logout();
  } catch {
    /* signing out locally is what matters */
  }
  pushedPeople.clear();
  pushedIndex = null;
  Object.assign(pod, {
    state: 'off', webId: null, podUrl: null, base: null, indexUrl: null, legacyUrl: null,
    needsLocation: false, suggested: null, foundVia: null, registered: null,
    error: null, syncing: false, lastSync: null, unreadable: 0, migrated: false,
    viewLinks: [], incoming: null, indexWritable: true
  });
}

/* ---------------------------------------------------------------- where

   A pod is the person's storage, not the app's, so the app should not
   simply assume a folder. The profile's type index is the Solid way of
   asking "where does data of this kind live"; only when nothing answers
   do we propose somewhere and ask. */

async function afterLogin(webId) {
  pod.webId = webId;
  const { authn, client, rdf, typeindex } = await libs();
  const fetch = authn.fetch;

  const podUrl = await findStorage(client, webId, fetch);

  pod.podUrl = asContainer(podUrl);
  pod.suggested = pod.podUrl + DEFAULT_DIR;
  pod.state = 'on';
  pod.error = null;

  // 1. What does their own pod say?
  const reg = await typeindex.findRegistration(client, webId, rdf.T.Wardrobe, fetch);
  const registered = reg?.instance ?? (reg?.container ? asContainer(reg.container) + INDEX_FILE : null);
  if (registered) {
    setLocation(registered, 'type-index');
    return firstSync();
  }

  // 2. Somewhere we remember, or the folder older versions used.
  const remembered = localStorage.getItem(LOCATION);
  for (const candidate of [remembered, pod.suggested + INDEX_FILE].filter(Boolean)) {
    if (await exists(candidate, fetch)) {
      setLocation(candidate, 'existing');
      registerLocation();
      return firstSync();
    }
  }
  if (await exists(pod.suggested + LEGACY_FILE, fetch)) {
    setLocation(pod.suggested + INDEX_FILE, 'existing');
    registerLocation();
    return firstSync();
  }

  // 3. Nothing to go on: ask before writing anywhere.
  pod.needsLocation = true;
}

/* Which container is the person's actual storage? A profile may say so with
   pim:storage, but a fresh Community Solid Server pod does not. The spec's
   other answer is a Link header on the storage itself, so walk up from the
   WebID document and take the first container that claims to be one. Falling
   back to the origin would hand back the whole server on a host that keeps
   many pods side by side. */
async function findStorage(client, webId, fetch) {
  try {
    const declared = (await client.getPodUrlAll(webId, { fetch }))?.[0];
    if (declared) return asContainer(declared);
  } catch {
    /* profiles that do not say are normal; keep looking */
  }

  const url = new URL(webId);
  const parts = url.pathname.split('/').filter(Boolean);
  for (let depth = parts.length - 1; depth >= 0; depth--) {
    const candidate = `${url.origin}/${parts.slice(0, depth).map((p) => `${p}/`).join('')}`;
    try {
      const res = await fetch(candidate, { method: 'HEAD' });
      const link = res.headers.get('link') ?? '';
      if (/<http:\/\/www\.w3\.org\/ns\/pim\/space#Storage>\s*;\s*rel\s*=\s*"?type"?/i.test(link)) {
        return candidate;
      }
    } catch {
      /* unreachable ancestor: try the next one up */
    }
  }
  return `${url.origin}/`;
}

async function exists(url, fetch) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function setLocation(indexUrl, via) {
  pod.indexUrl = indexUrl;
  pod.indexWritable = true;
  pod.base = indexUrl.slice(0, indexUrl.lastIndexOf('/') + 1);
  pod.legacyUrl = pod.base + LEGACY_FILE;
  pod.foundVia = via;
  pod.needsLocation = false;
  localStorage.setItem(LOCATION, indexUrl);
}

/** Accepts either a container ("…/clothes/") or a full document URL. */
export function normaliseLocation(input) {
  let url = (input || '').trim();
  if (!url) return null;
  try {
    url = new URL(url, pod.podUrl ?? undefined).href;
  } catch {
    return null;
  }
  if (!/\.(ttl|jsonld|nq|trig)$/i.test(url)) url = asContainer(url) + INDEX_FILE;
  // A person's own document (the address a single-person share used to show)
  // lives beside the index, so open the wardrobe it belongs to.
  else if (PERSON_DOC.test(url)) url = url.slice(0, url.lastIndexOf('/') + 1) + INDEX_FILE;
  return url;
}

/** The person picked a place. Write there, and say so in the type index. */
export async function chooseLocation(input) {
  const url = normaliseLocation(input);
  if (!url) {
    pod.error = 'That does not look like an address inside a pod.';
    return false;
  }
  setLocation(url, 'chosen');
  pod.error = null;
  await registerLocation();
  await firstSync();
  return true;
}

async function registerLocation() {
  try {
    const { authn, client, rdf, typeindex } = await libs();
    pod.registered = await typeindex.register(
      client, pod.webId, rdf.T.Wardrobe, pod.indexUrl, authn.fetch, pod.podUrl
    );
  } catch {
    pod.registered = { ok: false, reason: 'refused' };
  }
}

/* --------------------------------------------------------------- syncing */

/* The device remembers which version it last agreed with the pod on, so on
   the next connect it can tell its own edits from someone else's. */
function syncedAt() {
  try {
    const mark = JSON.parse(localStorage.getItem(SYNCED) ?? 'null');
    return mark?.url === pod.indexUrl ? Date.parse(mark.at) || null : null;
  } catch {
    return null;
  }
}

function markSynced(at = doc.updatedAt) {
  try {
    localStorage.setItem(SYNCED, JSON.stringify({ url: pod.indexUrl, at }));
  } catch {
    /* storage unavailable: the next connect asks instead */
  }
}

/* On connecting, a copy nobody touched since the last sync gives way to the
   other. Only when both changed does the person decide; with no record of
   the last sync, the most recent edit wins unless both have real content. */
async function firstSync() {
  loadViewLinks();
  const remote = await pull({ quiet: true });
  if (remote === null) {
    await push(); // nothing there yet: seed the pod with this device
    return;
  }
  const action = syncDecision({ remote, local: doc, mark: syncedAt(), indexWritable: pod.indexWritable });
  if (action === 'apply') applyIncoming(remote);
  else if (action === 'remember') rememberPushed();
  else if (action === 'ask') pod.incoming = remote;
  else await push();
}

/** What connecting should do with the pod's copy (remote) and this device's
    (local): 'push', 'apply' the pod's, 'remember' that they already agree,
    or 'ask' the person. mark is when the two last agreed, or null. */
export function syncDecision({ remote, local, mark, indexWritable }) {
  // Someone holding only part of a wardrobe takes the pod's copy, never pushes theirs over it.
  if (!indexWritable) return 'apply';

  const localHas = local.people.length > 0;
  const remoteHas = Array.isArray(remote.people) && remote.people.length > 0;
  if (!remoteHas) return 'push';
  if (!localHas) return 'apply';

  const rt = Date.parse(remote.updatedAt ?? 0) || 0;
  const lt = Date.parse(local.updatedAt ?? 0) || 0;
  if (mark !== null) {
    const localChanged = lt > mark;
    const remoteChanged = rt !== mark;
    if (!localChanged) return rt === lt ? 'remember' : 'apply';
    if (!remoteChanged) return 'push';
  }
  return rt > lt || mark !== null ? 'ask' : 'push';
}

export function applyIncoming(remote) {
  replaceDoc(remote);
  pod.incoming = null;
  pod.lastSync = new Date().toISOString();
  rememberPushed(); // it came from the pod, so nothing needs sending back
  markSynced();
}

export async function keepLocal() {
  pod.incoming = null;
  pushedPeople.clear();
  pushedIndex = null;
  await push();
}

/** Read the wardrobe. Returns null when nothing is stored there yet. */
export async function pull({ quiet = false } = {}) {
  if (pod.state !== 'on' || !pod.indexUrl) return null;
  pod.syncing = true;
  try {
    const { authn, client, rdf } = await libs();
    const fetch = authn.fetch;
    const indexDs = await client.getSolidDataset(pod.indexUrl, { fetch });
    pod.indexWritable = client.getEffectiveAccess(indexDs).user.write !== false;

    // One document per person, so fetch the ones this index points at.
    const datasets = [indexDs];
    let unreadable = 0;
    for (const url of rdf.wearerDocs(client, indexDs, pod.indexUrl)) {
      try {
        datasets.push(await client.getSolidDataset(url, { fetch }));
      } catch {
        unreadable++; // shared away, or since removed: keep the rest
      }
    }

    const parsed = rdf.readWardrobe(client, datasets);
    if (!parsed) throw new Error('No wardrobe found in that document');
    pod.unreadable = unreadable;
    pod.lastSync = new Date().toISOString();
    pod.error = null;
    pod.migrated = false;
    return parsed;
  } catch (err) {
    if (isMissing(err)) return await pullLegacy();
    if (!quiet) fail(err, 'The pod would not hand over the wardrobe.', true);
    return null;
  } finally {
    pod.syncing = false;
  }
}

/** A pod written before the move to RDF still holds a JSON document.
    Read it so nothing is lost; the next save writes Turtle instead. */
async function pullLegacy() {
  try {
    const { authn, client } = await libs();
    const file = await client.getFile(pod.legacyUrl, { fetch: authn.fetch });
    const parsed = JSON.parse(await file.text());
    pod.migrated = true;
    pod.lastSync = new Date().toISOString();
    return parsed;
  } catch {
    return null; // neither exists: a fresh location
  }
}

/* Only the documents that actually changed get written, so editing one
   person does not rewrite the whole household. */

/** Which person documents a push writes and deletes. pushed maps id to the
    JSON last written. In a wardrobe shared with us person by person the list
    is not ours (ownsList false): edit the people we were given, but add or
    remove nobody; those changes are counted in outOfReach instead. */
export function planPush(people, pushed, ownsList) {
  const write = [];
  const remove = [];
  let outOfReach = 0;
  for (const person of people) {
    if (pushed.get(person.id) === JSON.stringify(person)) continue;
    if (!ownsList && !pushed.has(person.id)) outOfReach++;
    else write.push(person);
  }
  const living = new Set(people.map((p) => p.id));
  for (const id of pushed.keys()) {
    if (living.has(id)) continue;
    if (!ownsList) outOfReach++;
    else remove.push(id);
  }
  return { write, remove, outOfReach };
}
const pushedPeople = new Map();
let pushedIndex = null;

function rememberPushed() {
  const snap = snapshot();
  pushedPeople.clear();
  for (const p of snap.people) pushedPeople.set(p.id, JSON.stringify(p));
  pushedIndex = indexKey(snap);
}

const indexKey = (snap) =>
  JSON.stringify({ units: snap.units, at: snap.updatedAt, ids: snap.people.map((p) => p.id) });

/* Replacing a document must not delete it. A delete-and-recreate would take
   the resource's ACL with it and silently revoke everything shared from it —
   and saveSolidDatasetAt on a locally built dataset sends If-None-Match:*,
   which a real server answers with 412 on the second write. So load what is
   there, clear it, and put ours in its place: solid-client then sends a patch
   against the existing resource. */
async function writeDoc(client, fetch, url, fresh) {
  let target;
  try {
    target = await client.getSolidDataset(url, { fetch });
    for (const t of client.getThingAll(target)) target = client.removeThing(target, t);
  } catch (err) {
    if (!isMissing(err)) throw err;
    target = client.createSolidDataset(); // does not exist yet: create it
  }
  for (const t of client.getThingAll(fresh)) target = client.setThing(target, t);
  return client.saveSolidDatasetAt(url, target, { fetch });
}

export async function push() {
  if (pod.state !== 'on' || pod.incoming || !pod.indexUrl) return;
  pod.syncing = true;
  try {
    const { authn, client, rdf } = await libs();
    const fetch = authn.fetch;
    const snap = snapshot();
    const ownsList = pod.indexWritable;
    const plan = planPush(snap.people, pushedPeople, ownsList);

    for (const person of plan.write) {
      const url = rdf.personDocUrl(pod.base, person.id);
      await writeDoc(client, fetch, url, rdf.buildPerson(client, person, url));
      pushedPeople.set(person.id, JSON.stringify(person));
    }

    for (const id of plan.remove) {
      try {
        await client.deleteSolidDataset(rdf.personDocUrl(pod.base, id), { fetch });
      } catch {
        /* already gone, or not ours to delete */
      }
      pushedPeople.delete(id);
    }

    const key = indexKey(snap);
    if (ownsList && key !== pushedIndex) {
      await writeDoc(client, fetch, pod.indexUrl, rdf.buildIndex(client, snap, pod.indexUrl, pod.base));
      pushedIndex = key;
    }

    markSynced(snap.updatedAt);
    await refreshViewLinks();

    pod.lastSync = new Date().toISOString();
    pod.migrated = false;
    pod.error = plan.outOfReach
      ? 'Only the people shared with you are saved here. Adding or removing people is up to whoever owns this wardrobe.'
      : null;
  } catch (err) {
    fail(err, 'The pod did not accept the save. Check you are still signed in, then try again.', true);
  } finally {
    pod.syncing = false;
  }
}

/* ------------------------------------------------------------ view links

   A link anyone can open cannot be authorised by WebID, because the person
   opening it has none. In Solid that leaves exactly one option: the document
   is public, and its secrecy is the unguessable address. So the link is a
   capability — treat it like a password — and what sits at the far end is a
   separate copy holding only what was shared. The real records never become
   public, and revoking is deleting one file. */

const isShareCopy = (url) =>
  url.endsWith('.ttl') &&
  (url.slice(url.lastIndexOf('/') + 1).startsWith(SHARE_PREFIX) || url.startsWith(pod.base + LEGACY_SHARE_DIR));

const linkFor = (docUrl) =>
  `${window.location.origin}${window.location.pathname}?view=${encodeURIComponent(docUrl)}`;

/** Snapshot the chosen people into a public document at a random address. */
export async function createViewLink(scope, { includeVitals = false } = {}) {
  if (pod.state !== 'on' || !pod.base) return { ok: false, error: 'Connect a pod first.' };
  const people = peopleIn(scope).map((p) => (includeVitals ? p : { ...p, vitals: [] }));
  if (!people.length) return { ok: false, error: 'There is nobody to share.' };

  const token = crypto.randomUUID();
  const url = `${pod.base}${SHARE_PREFIX}${token}.ttl`;
  /* Two different failures hide behind "would not publish": the copy may
     never have been written, or it was written and the pod refused to make
     it public. Say which, with the server's own words. */
  let step = 'write';
  try {
    const { authn, client, rdf } = await libs();
    const fetch = authn.fetch;
    // The address is brand new, so there is nothing to read first. Asking
    // anyway is not harmless: Nextcloud's Solid server answers 403, not 404,
    // for a file that does not exist yet.
    await client.saveSolidDatasetAt(url, rdf.buildShare(client, url, people, {
      units: doc.units, sharedBy: pod.webId, at: Date.now()
    }), { fetch });
    step = 'public';
    const granted = await client.universalAccess.setPublicAccess(
      url, { read: true, write: false, append: false }, { fetch });
    // null means solid-client could not find an access list it may edit.
    if (!granted?.read) throw new Error('no editable access list for the copy');
    publishedHash.set(url, JSON.stringify({ units: doc.units, people }));
    await loadViewLinks();
    return { ok: true, url, link: linkFor(url) };
  } catch (err) {
    console.warn('view link failed at', step, url, err);
    const why = err?.message ? ` (${err.message})` : '';
    if (step === 'write') {
      return { ok: false, error: `The pod would not take the shared copy${why}.` };
    }
    // Leave nothing private-but-orphaned behind in the share folder.
    try {
      const { authn, client } = await libs();
      await client.deleteSolidDataset(url, { fetch: authn.fetch });
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      error: `The copy was written, but the pod would not make it public${why}. It has to allow public read on a single file.`
    };
  }
}

/** Older versions kept view-link copies in a subfolder. Only look in it when
    the folder listing says it exists, rather than asking for it every time. */
export const legacyShareDirIn = (contained, base) =>
  contained.includes(base + LEGACY_SHARE_DIR) ? [base + LEGACY_SHARE_DIR] : [];

/** Every link currently live, read from the pod rather than remembered here. */
export async function loadViewLinks() {
  if (pod.state !== 'on' || !pod.base) return;
  try {
    const { authn, client, rdf } = await libs();
    const fetch = authn.fetch;
    const urls = [];
    const dirs = [pod.base];
    for (let i = 0; i < dirs.length; i++) {
      try {
        const contained = client.getContainedResourceUrlAll(await client.getSolidDataset(dirs[i], { fetch }));
        urls.push(...contained.filter(isShareCopy));
        if (i === 0) dirs.push(...legacyShareDirIn(contained, pod.base));
      } catch {
        /* unreadable: nothing to list */
      }
    }
    const out = [];
    for (const url of urls) {
      try {
        const parsed = rdf.readWardrobe(client, [await client.getSolidDataset(url, { fetch })]);
        if (!parsed) continue;
        out.push({
          url,
          link: linkFor(url),
          // Match on id, never on name: a rename must not orphan the link.
          ids: parsed.people.map((p) => p.id),
          names: parsed.people.map((p) => p.name),
          vitals: parsed.people.some((p) => p.vitals.length),
          at: parsed.updatedAt
        });
      } catch {
        /* a file we cannot read is not ours to list */
      }
    }
    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    pod.viewLinks = out;
  } catch {
    pod.viewLinks = []; // no share folder yet is the same as no links
  }
}

export async function revokeViewLink(url) {
  publishedHash.delete(url);
  try {
    const { authn, client } = await libs();
    await client.deleteSolidDataset(url, { fetch: authn.fetch });
  } catch (err) {
    console.warn(err);
    return { ok: false, error: 'The pod would not delete that link.' };
  }
  await loadViewLinks();
  return { ok: true };
}

/** What a link is currently publishing, as the people it covers. */
function sharedPeople(live) {
  return doc.people
    .filter((p) => (live.ids ?? []).includes(p.id))
    .map((p) => (live.vitals ? p : { ...p, vitals: [] }));
}

/* Skip writes that would change nothing. Without this, every edit anywhere
   rewrites every published link. */
const publishedHash = new Map();

/** A published copy is a copy, so it has to follow the real records — and
    stop existing when they do. Someone removed from the wardrobe must not
    carry on being readable by anyone holding the link. */
async function refreshViewLinks() {
  if (!pod.viewLinks?.length) return;
  const { authn, client, rdf } = await libs();
  const fetch = authn.fetch;
  let withdrew = false;

  for (const live of pod.viewLinks) {
    const people = sharedPeople(live);

    if (!people.length) {
      try {
        await client.deleteSolidDataset(live.url, { fetch });
        publishedHash.delete(live.url);
        withdrew = true;
      } catch {
        /* leave it; the next change tries again */
      }
      continue;
    }

    const payload = JSON.stringify({ units: doc.units, people });
    if (publishedHash.get(live.url) === payload) continue;

    try {
      await writeDoc(client, fetch, live.url, rdf.buildShare(client, live.url, people, {
        units: doc.units, sharedBy: pod.webId, at: Date.now()
      }));
      publishedHash.set(live.url, payload);
    } catch {
      /* a link we cannot rewrite stays as it was */
    }
  }

  if (withdrew) await loadViewLinks();
}

/* --------------------------------------------------------------- sharing

   Access in Solid is granted per resource to a WebID. Because each person
   is a document of their own, one of them can be handed to someone without
   handing over the rest. */

export const WHOLE = { kind: 'all' };
export const forPerson = (id) => ({ kind: 'person', id });

export function scopeUrl(scope) {
  if (!pod.base) return null;
  return scope.kind === 'all' ? pod.base : `${pod.base}${scope.id}.ttl`;
}

const peopleIn = (scope) =>
  scope.kind === 'all' ? doc.people : doc.people.filter((p) => p.id === scope.id);

/** Everything a grant on this scope has to be written to for it to be true. */
function scopeTargets(scope) {
  if (scope.kind === 'person') return [scopeUrl(scope)];
  return [pod.base, pod.indexUrl, ...doc.people.map((p) => `${pod.base}${p.id}.ttl`)];
}

/** Who can already see this, and how. */
export async function readAccess(scope) {
  const url = scopeUrl(scope);
  if (!url) return { entries: [], error: null };
  try {
    const { authn, client } = await libs();
    const all = await client.universalAccess.getAgentAccessAll(url, { fetch: authn.fetch });
    const entries = Object.entries(all ?? {})
      .filter(([webId, a]) => webId !== pod.webId && (a?.read || a?.write || a?.append))
      .map(([webId, a]) => ({ webId, read: !!a.read, write: !!(a.write || a.append) }));
    return { entries, error: null };
  } catch (err) {
    console.warn(err);
    return { entries: [], error: 'This pod would not say who has access. It may not support the access API.' };
  }
}

const MODES = {
  none: { read: false, append: false, write: false, controlRead: false, controlWrite: false },
  read: { read: true, append: false, write: false },
  write: { read: true, append: true, write: true }
};

/** Grant or revoke, writing every resource the scope covers. */
export async function setAccess(scope, webId, level) {
  const id = (webId || '').trim();
  if (!/^https?:\/\/\S+$/i.test(id)) {
    return { ok: false, error: 'A WebID is a URL, like https://someone.solidcommunity.net/profile/card#me' };
  }
  const modes = MODES[level];
  if (!modes) return { ok: false, error: 'Unknown access level.' };

  try {
    const { authn, client } = await libs();
    const fetch = authn.fetch;
    for (const url of scopeTargets(scope)) {
      if (!url) continue;
      await client.universalAccess.setAgentAccess(url, id, modes, { fetch });
    }
    if (scope.kind === 'person') await indexAccessFor(client, fetch, id, scope.id, level !== 'none');
    return { ok: true };
  } catch (err) {
    console.warn(err);
    return {
      ok: false,
      error: 'The pod refused the change. You need control of the resource, and the server has to support setting access.'
    };
  }
}

/* The index holds only the people's opaque document links, so reading it
   tells a person-only recipient how many people there are and nothing
   else. Without it they could not open the wardrobe at all. It never
   becomes writable this way: whoever holds only some people must not
   rewrite the list. */
async function indexAccessFor(client, fetch, webId, personId, granted) {
  if (granted) {
    // Partial modes merge, so whole-wardrobe edit access is left alone.
    await client.universalAccess.setAgentAccess(pod.indexUrl, webId, { read: true }, { fetch });
    return;
  }
  const others = [pod.base, ...doc.people.filter((p) => p.id !== personId).map((p) => `${pod.base}${p.id}.ttl`)];
  // A few at a time: each check is several requests, and a server swamped
  // with them starts failing. Any answer that is not a clear "no" keeps it.
  for (let i = 0; i < others.length; i += 4) {
    const access = await Promise.all(
      others.slice(i, i + 4).map((url) => client.universalAccess.getAgentAccess(url, webId, { fetch }).catch(() => null))
    );
    if (stillReads(access)) return;
  }
  await client.universalAccess.setAgentAccess(pod.indexUrl, webId, MODES.none, { fetch });
}

/** Whether these access checks leave the agent reading something here. An
    answer that is not a clear "no" (null: the check failed) counts as yes,
    so a busy server never costs anyone their access. */
export const stillReads = (access) => access.some((a) => a === null || a?.read);

function isMissing(err) {
  const code = err?.statusCode ?? err?.response?.status;
  return code === 404 || /\b404\b/.test(String(err?.message ?? err));
}

function fail(err, message, stayOn = false) {
  console.warn(err);
  pod.error = message;
  if (!stayOn) pod.state = 'error';
}

/* Local edits go up automatically, batched so a burst of typing is one write. */
let timer;
watchDoc(() => {
  if (pod.state !== 'on' || !pod.indexUrl) return;
  clearTimeout(timer);
  timer = setTimeout(push, 1200);
});
