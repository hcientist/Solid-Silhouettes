import { doc, snapshot, replaceDoc, watchDoc } from './store.svelte.js';

/* A pod is optional. The app is fully usable without one, so the Solid
   libraries are only fetched when someone actually connects — which also
   means a broken network never takes the local app down with it. */

const WANTED = 'solidsilhouettes.pod.wanted';
const ISSUER = 'solidsilhouettes.pod.issuer';
const PATH = 'solidsilhouettes/wardrobe.ttl';
/** Written by versions before the move to RDF; read once, then left alone. */
const LEGACY_PATH = 'solidsilhouettes/wardrobe.json';

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
  fileUrl: null,
  legacyUrl: null,
  error: null,
  syncing: false,
  lastSync: null,
  /** true when what we read came from a pre-RDF JSON document */
  migrated: false,
  /** set when the pod holds a newer copy than this device */
  incoming: null
});

let authn = null;
let client = null;
let rdf = null;

async function libs() {
  if (!authn) {
    [authn, client, rdf] = await Promise.all([
      import('@inrupt/solid-client-authn-browser'),
      import('@inrupt/solid-client'),
      import('./rdf.js')
    ]);
  }
  return { authn, client, rdf };
}

const redirectUrl = () => window.location.origin + window.location.pathname;

/** Run once on load: finishes a redirect, or restores a live session. */
export async function bootPod() {
  const params = new URLSearchParams(window.location.search);
  const returning = params.has('code') || params.has('error');
  if (!returning && localStorage.getItem(WANTED) !== '1') return;

  pod.state = 'connecting';
  try {
    const { authn } = await libs();
    await authn.handleIncomingRedirect({ restorePreviousSession: true });
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
  localStorage.setItem(ISSUER, url);
  try {
    const { authn } = await libs();
    await authn.login({
      oidcIssuer: url,
      redirectUrl: redirectUrl(),
      clientName: 'SolidSilhouettes'
    });
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
  Object.assign(pod, {
    state: 'off',
    webId: null,
    podUrl: null,
    fileUrl: null,
    legacyUrl: null,
    error: null,
    syncing: false,
    lastSync: null,
    migrated: false,
    incoming: null
  });
}

async function afterLogin(webId) {
  pod.webId = webId;
  const { authn, client } = await libs();
  const fetch = authn.fetch;

  let podUrl = null;
  try {
    const all = await client.getPodUrlAll(webId, { fetch });
    podUrl = all?.[0] ?? null;
  } catch {
    /* not every profile advertises its storage; fall back below */
  }
  if (!podUrl) podUrl = new URL('/', webId).href;

  pod.podUrl = podUrl;
  const root = podUrl.replace(/\/?$/, '/');
  pod.fileUrl = root + PATH;
  pod.legacyUrl = root + LEGACY_PATH;
  pod.state = 'on';
  pod.error = null;

  await firstSync();
}

/* On connecting, whichever copy was edited most recently wins — unless
   both have real content, in which case the person decides. */
async function firstSync() {
  const remote = await pull({ quiet: true });
  if (remote === null) {
    await push(); // nothing there yet: seed the pod with this device
    return;
  }
  const localHas = doc.people.length > 0;
  const remoteHas = Array.isArray(remote.people) && remote.people.length > 0;

  if (!remoteHas) return void (await push());
  if (!localHas) return void applyIncoming(remote);

  const rt = Date.parse(remote.updatedAt ?? 0) || 0;
  const lt = Date.parse(doc.updatedAt ?? 0) || 0;
  if (rt > lt) pod.incoming = remote;
  else await push();
}

export function applyIncoming(remote) {
  replaceDoc(remote);
  pod.incoming = null;
  pod.lastSync = new Date().toISOString();
}

export async function keepLocal() {
  pod.incoming = null;
  await push();
}

/** Read the pod copy. Returns null when nothing is stored there yet. */
export async function pull({ quiet = false } = {}) {
  if (pod.state !== 'on') return null;
  pod.syncing = true;
  try {
    const { authn, client, rdf } = await libs();
    const ds = await client.getSolidDataset(pod.fileUrl, { fetch: authn.fetch });
    const parsed = rdf.readDataset(client, ds);
    if (!parsed) throw new Error('No wardrobe found in that file');
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
    return null; // neither file exists: a fresh pod
  }
}

export async function push() {
  if (pod.state !== 'on' || pod.incoming) return;
  pod.syncing = true;
  try {
    const { authn, client, rdf } = await libs();
    const ds = rdf.buildDataset(client, snapshot(), pod.fileUrl);
    await client.saveSolidDatasetAt(pod.fileUrl, ds, { fetch: authn.fetch });
    pod.lastSync = new Date().toISOString();
    pod.migrated = false;
    pod.error = null;
  } catch (err) {
    fail(err, 'The pod did not accept the save. Check you are still signed in, then try again.', true);
  } finally {
    pod.syncing = false;
  }
}

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
  if (pod.state !== 'on') return;
  clearTimeout(timer);
  timer = setTimeout(push, 1200);
});
