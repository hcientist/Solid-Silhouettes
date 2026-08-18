/* Does an edit to the owner's copy reach the public one? And, just as much
   to the point, does removing someone stop it? Exercised through the app's
   own refresh logic, mirrored here because it lives in a runes module. */
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';
import { buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair } from '../node_modules/@inrupt/solid-client-authn-core/dist/index.mjs';
import { buildShare, readWardrobe } from '../src/lib/rdf.js';

const SERVER = 'http://localhost:3111';
const RUN = Date.now().toString(36);
let fails = 0;
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`); };

const get = async (u, t) => (await fetch(u, { headers: t ? { authorization: `CSS-Account-Token ${t}` } : {} })).json();
const post = async (u, t, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `CSS-Account-Token ${t}` } : {}) }, body: JSON.stringify(b ?? {}) })).json();

const idx = await get(`${SERVER}/.account/`);
const cr = await post(idx.controls.account.create, null);
const acct = await get(`${SERVER}/.account/`, cr.authorization);
await post(acct.controls.password.create, cr.authorization, { email: `r-${RUN}@x.invalid`, password: 'sekret' });
const podRes = await post(acct.controls.account.pod, cr.authorization, { name: `ref${RUN}` });
const withPod = await get(`${SERVER}/.account/`, cr.authorization);
const cc = await post(withPod.controls.account.clientCredentials, cr.authorization, { name: 't', webId: podRes.webId });
const dpopKey = await generateDpopKeyPair();
const tokenUrl = `${SERVER}/.oidc/token`;
const basic = Buffer.from(`${encodeURIComponent(cc.id)}:${encodeURIComponent(cc.secret)}`).toString('base64');
const tok = await (await fetch(tokenUrl, { method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey) }, body: 'grant_type=client_credentials&scope=webid' })).json();
const oFetch = await buildAuthenticatedFetch(tok.access_token, { dpopKey });

const BASE = `${podRes.pod}wardrobe/`;
const blank = (id, name, chalk, size) => ({
  id, name, chalk, birthday: '', added: '2025-01-01T00:00:00.000Z', updated: '2025-01-01T00:00:00.000Z', revisions: [],
  glasses: { size: '', brand: '', note: '', pdMm: null, rxDate: '', od: {}, os: {}, updated: null, revisions: [] },
  shirt: { size, brand: '', note: '', chestCm: 70, sleeveCm: null, neckCm: null, updated: '2026-01-01T00:00:00.000Z', revisions: [] },
  pants: { size: '', brand: '', note: '', waistCm: null, inseamCm: null, hipCm: null, updated: null, revisions: [] },
  shoes: { size: '', system: 'US', width: '', footCm: null, brand: '', note: '', updated: null, revisions: [] },
  vitals: []
});

// The app's own state, as the refresh sees it.
const doc = { units: 'metric', people: [blank('devi', 'Devi', 'rose', '10'), blank('ravi', 'Ravi', 'green', '5T')] };

async function writeDoc(fetch, url, fresh) {
  let target;
  try {
    target = await client.getSolidDataset(url, { fetch });
    for (const t of client.getThingAll(target)) target = client.removeThing(target, t);
  } catch { target = client.createSolidDataset(); }
  for (const t of client.getThingAll(fresh)) target = client.setThing(target, t);
  return client.saveSolidDatasetAt(url, target, { fetch });
}

/* --- mirrors refreshViewLinks() in solid.svelte.js --- */
const publishedHash = new Map();
let writes = 0;
const sharedPeople = (live) =>
  doc.people.filter((p) => live.ids.includes(p.id)).map((p) => (live.vitals ? p : { ...p, vitals: [] }));

async function refresh(links) {
  const still = [];
  for (const live of links) {
    const people = sharedPeople(live);
    if (!people.length) {
      try { await client.deleteSolidDataset(live.url, { fetch: oFetch }); publishedHash.delete(live.url); } catch { /* */ }
      continue;
    }
    const payload = JSON.stringify({ units: doc.units, people });
    if (publishedHash.get(live.url) === payload) { still.push(live); continue; }
    await writeDoc(oFetch, live.url, buildShare(client, live.url, people, { units: doc.units, sharedBy: podRes.webId, at: Date.now() }));
    publishedHash.set(live.url, payload);
    writes++;
    still.push(live);
  }
  return still;
}

async function publish(people, vitals = false) {
  const url = `${BASE}shared/${crypto.randomUUID()}.ttl`;
  const payload = people.map((p) => (vitals ? p : { ...p, vitals: [] }));
  await writeDoc(oFetch, url, buildShare(client, url, payload, { units: doc.units, sharedBy: podRes.webId, at: Date.now() }));
  await client.universalAccess.setPublicAccess(url, { read: true, write: false, append: false }, { fetch: oFetch });
  publishedHash.set(url, JSON.stringify({ units: doc.units, people: payload }));
  return { url, ids: people.map((p) => p.id), vitals };
}

// what a stranger sees
const strangerSees = async (url) => {
  try { return readWardrobe(client, [await client.getSolidDataset(url)]); } catch { return null; }
};

let links = [await publish([doc.people[0]]), await publish([doc.people[1]])];
ok('two links published', (await strangerSees(links[0].url))?.people[0].shirt.size === '10');

// --- 1. an edit reaches the public copy ---
writes = 0;
doc.people[0].shirt.size = '12';
links = await refresh(links);
ok('editing a size updates the public copy', (await strangerSees(links[0].url))?.people[0].shirt.size === '12');

// --- 2. only the affected link is rewritten ---
ok('an unrelated link is not rewritten', writes === 1, `${writes} write(s)`);

// --- 3. nothing changed means nothing written ---
writes = 0;
links = await refresh(links);
ok('a refresh with no changes writes nothing', writes === 0, `${writes} write(s)`);

// --- 4. renaming must not orphan the link ---
doc.people[0].name = 'Devika';
links = await refresh(links);
const renamed = await strangerSees(links[0].url);
ok('renaming still updates the link', renamed?.people[0].name === 'Devika', renamed?.people[0].name);

// --- 5. removing a shared person withdraws their link ---
const goneUrl = links[0].url;
doc.people = doc.people.filter((p) => p.id !== 'devi');
links = await refresh(links);
ok('deleting the only shared person withdraws the link', (await strangerSees(goneUrl)) === null);
ok('the other link survives', (await strangerSees(links[0]?.url))?.people[0].name === 'Ravi');

// --- 6. a link covering several people drops just the one removed ---
doc.people = [blank('a', 'Ana', 'blue', 'S'), blank('b', 'Bo', 'ochre', 'M')];
let multi = [await publish(doc.people)];
ok('a multi-person link publishes both', (await strangerSees(multi[0].url))?.people.length === 2);
doc.people = doc.people.filter((p) => p.id !== 'a');
multi = await refresh(multi);
const left = await strangerSees(multi[0].url);
ok('removing one person leaves the other published', left?.people.length === 1 && left.people[0].name === 'Bo',
  left?.people.map((p) => p.name).join());

console.log(fails ? `\n${fails} FAILED` : '\nall link-refresh checks passed');
process.exit(fails ? 1 : 0);
