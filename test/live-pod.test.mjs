/* End to end against a real Solid server (Community Solid Server, in memory).
   Two accounts: an owner who writes a wardrobe, and a friend who is granted
   access to exactly one person. Exercises real HTTP, real Turtle over the
   wire, and real Web Access Control. */
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';
import { buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair } from '../node_modules/@inrupt/solid-client-authn-core/dist/index.mjs';
import { buildIndex, buildPerson, readWardrobe, wearerDocs, personDocUrl, T } from '../src/lib/rdf.js';
import { findRegistration, register } from '../src/lib/typeindex.js';

const SERVER = 'http://localhost:3111';
let fails = 0;
const ok = (n, c, extra = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  (' + extra + ')' : ''}`); };

async function makeAccount(email, podName) {
  // GETs must not carry a content-type: CSS will try to parse the empty body.
  const get = async (url, token) =>
    (await fetch(url, { headers: token ? { authorization: `CSS-Account-Token ${token}` } : {} })).json();
  const post = async (url, token, body) =>
    (await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `CSS-Account-Token ${token}` } : {}) },
      body: JSON.stringify(body ?? {})
    })).json();

  const idx = await get(`${SERVER}/.account/`);
  const created = await post(idx.controls.account.create, null);
  const token = created.authorization;

  const acct = await get(`${SERVER}/.account/`, token);
  const login = await post(acct.controls.password.create, token, { email, password: 'sekret' });
  if (login.statusCode) throw new Error(`login setup failed: ${login.message}`);
  // The WebID comes back from creating the pod, not from the account object.
  const pod = await post(acct.controls.account.pod, token, { name: podName });

  const withPod = await get(`${SERVER}/.account/`, token);
  const cc = await post(withPod.controls.account.clientCredentials, token, {
    name: `${podName}-tok`,
    webId: pod.webId
  });
  if (!cc.id) throw new Error(`no client credentials: ${JSON.stringify(cc).slice(0, 200)}`);

  return { webId: pod.webId, podUrl: pod.pod, id: cc.id, secret: cc.secret };
}

async function authFetch(acct) {
  const dpopKey = await generateDpopKeyPair();
  const tokenUrl = `${SERVER}/.oidc/token`;
  const basic = Buffer.from(`${encodeURIComponent(acct.id)}:${encodeURIComponent(acct.secret)}`).toString('base64');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey)
    },
    body: 'grant_type=client_credentials&scope=webid'
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${text.slice(0, 300)}`);
  const { access_token } = JSON.parse(text);
  return await buildAuthenticatedFetch(access_token, { dpopKey });
}

// The server keeps accounts for its lifetime, so each run needs its own.
const RUN = Date.now().toString(36);
console.log('creating accounts…');
const owner = await makeAccount(`owner-${RUN}@test.invalid`, `owner${RUN}`);
const friend = await makeAccount(`friend-${RUN}@test.invalid`, `friend${RUN}`);
const oFetch = await authFetch(owner);
const fFetch = await authFetch(friend);
console.log('  owner  ', owner.webId);
console.log('  friend ', friend.webId, '\n');

const BASE = `${owner.podUrl}wardrobe/`;
const INDEX = `${BASE}wardrobe.ttl`;

const snapshot = {
  version: 3, updatedAt: '2026-08-18T09:15:00.000Z', units: 'metric',
  people: [
    { id: 'devi', name: 'Devi', chalk: 'rose', birthday: '2016-09-22',
      added: '2025-01-04T08:00:00.000Z', updated: '2026-06-01T10:30:00.000Z', revisions: [],
      glasses: { size: '46-16-125', brand: '', note: '', pdMm: 54.5, rxDate: '2026-02-10',
        od: { sph: -1.75, cyl: -0.5, axis: 175, add: null }, os: { sph: -1.5, cyl: null, axis: null, add: null },
        updated: '2026-02-11T17:04:00.000Z', revisions: [] },
      shirt: { size: '10', brand: 'Hanna', note: '', chestCm: 71, sleeveCm: 50, neckCm: null, updated: '2026-06-20T11:00:00.000Z', revisions: [] },
      pants: { size: '', brand: '', note: '', waistCm: null, inseamCm: null, hipCm: null, updated: null, revisions: [] },
      shoes: { size: '', system: 'US', width: '', footCm: null, brand: '', note: '', updated: null, revisions: [] },
      vitals: [{ date: '2026-08-01', weightKg: 32.1, heightCm: 141.5, recordedAt: '2026-08-03T19:20:00.000Z', approx: false, revisions: [] }] },
    { id: 'ash', name: 'Ash', chalk: 'violet', birthday: '',
      added: '2025-01-04T08:00:00.000Z', updated: '2025-01-04T08:00:00.000Z', revisions: [],
      glasses: { size: '', brand: '', note: '', pdMm: null, rxDate: '', od: {}, os: {}, updated: null, revisions: [] },
      shirt: { size: 'L', brand: 'Carhartt', note: '', chestCm: 106, sleeveCm: 65, neckCm: 41, updated: '2026-02-02T10:00:00.000Z', revisions: [] },
      pants: { size: '', brand: '', note: '', waistCm: null, inseamCm: null, hipCm: null, updated: null, revisions: [] },
      shoes: { size: '', system: 'US', width: '', footCm: null, brand: '', note: '', updated: null, revisions: [] },
      vitals: [] }
  ]
};

/* The same replace-in-place the app uses: never delete, so ACLs survive. */
async function writeDoc(fetch, url, fresh) {
  let target;
  try {
    target = await client.getSolidDataset(url, { fetch });
    for (const t of client.getThingAll(target)) target = client.removeThing(target, t);
  } catch {
    target = client.createSolidDataset();
  }
  for (const t of client.getThingAll(fresh)) target = client.setThing(target, t);
  return client.saveSolidDatasetAt(url, target, { fetch });
}

// ---- write to a real pod ----
const writeAll = async (snap, fetch) => {
  for (const p of snap.people) {
    const url = personDocUrl(BASE, p.id);
    await writeDoc(fetch, url, buildPerson(client, p, url));
  }
  await writeDoc(fetch, INDEX, buildIndex(client, snap, INDEX, BASE));
};
await writeAll(snapshot, oFetch);
ok('wardrobe written to a live pod', true);

// The bug a mock pod cannot show: the SECOND write to an existing resource.
let second = true;
try {
  const bumped = structuredClone(snapshot);
  bumped.people[0].shirt.size = '12';
  bumped.updatedAt = '2026-08-18T10:00:00.000Z';
  await writeAll(bumped, oFetch);
} catch (e) { second = false; console.log('   second write error:', String(e.message ?? e).slice(0, 160)); }
ok('a second write to an existing document succeeds', second);
if (second) {
  const ds2 = await client.getSolidDataset(personDocUrl(BASE, 'devi'), { fetch: oFetch });
  const g = client.getThing(ds2, `${personDocUrl(BASE, 'devi')}#devi-shirt`);
  ok('the update actually landed', client.getStringNoLocale(g, 'https://solidsilhouettes.app/ns#labelSize') === '12');
}

const raw = await (await oFetch(personDocUrl(BASE, 'devi'))).text();
ok('server stores real Turtle', raw.includes('solidsilhouettes.app/ns#Eyewear'), `${raw.split('\n').length} lines`);

// ---- read it back over HTTP ----
const indexDs = await client.getSolidDataset(INDEX, { fetch: oFetch });
const docs = wearerDocs(client, indexDs, INDEX);
const dss = [indexDs];
for (const d of docs) dss.push(await client.getSolidDataset(d, { fetch: oFetch }));
const back = readWardrobe(client, dss);
ok('read back over HTTP', back?.people.length === 2, `${back?.people.length} people`);
const devi = back.people.find((p) => p.name === 'Devi');
ok('prescription survives the round trip', devi.glasses.od.sph === -1.75 && devi.glasses.od.axis === 175);
ok('PD survives as millimetres', devi.glasses.pdMm === 54.5);
ok('reading survives', devi.vitals[0].heightCm === 141.5 && devi.vitals[0].approx === false);

// ---- type index ----
const reg = await register(client, owner.webId, T.Wardrobe, INDEX, oFetch, owner.podUrl);
ok('registered in the type index', reg.ok, reg.ok ? `${reg.private ? 'private' : 'public'}${reg.created ? ', created it' : ''}` : reg.reason);
const found = await findRegistration(client, owner.webId, T.Wardrobe, oFetch);
ok('a fresh client finds the wardrobe via the profile', found?.instance === INDEX, found?.instance ?? 'not found');

// ---- friend has no access yet ----
const deviUrl = personDocUrl(BASE, 'devi');
const ashUrl = personDocUrl(BASE, 'ash');
let denied = false;
try { await client.getSolidDataset(deviUrl, { fetch: fFetch }); } catch { denied = true; }
ok('a stranger cannot read a person', denied);

// ---- share exactly one person ----
await client.universalAccess.setAgentAccess(deviUrl, friend.webId,
  { read: true, append: false, write: false }, { fetch: oFetch });

let deviDs = null, ashDenied = false;
try { deviDs = await client.getSolidDataset(deviUrl, { fetch: fFetch }); } catch { /* */ }
ok('friend can now read the shared person', !!deviDs);
try { await client.getSolidDataset(ashUrl, { fetch: fFetch }); } catch { ashDenied = true; }
ok('sharing one person does NOT leak the others', ashDenied);

if (deviDs) {
  const solo = readWardrobe(client, [deviDs]);
  ok('a shared person document carries no wardrobe index', solo === null);
  const topic = client.getUrl(client.getThing(deviDs, deviUrl), 'http://xmlns.com/foaf/0.1/primaryTopic');
  ok('friend can find the subject from the document alone', topic === `${deviUrl}#devi`);
  const t = client.getThing(deviDs, `${deviUrl}#devi`);
  ok('friend reads the name', client.getStringNoLocale(t, 'http://www.w3.org/2006/vcard/ns#fn') === 'Devi');
}

// ---- an overwrite must not wipe the sharing ----
const bumped2 = structuredClone(snapshot);
bumped2.people[0].shirt.size = '14';
await writeAll(bumped2, oFetch);
let stillShared = false;
try { await client.getSolidDataset(deviUrl, { fetch: fFetch }); stillShared = true; } catch { /* */ }
ok('rewriting a document keeps who it was shared with', stillShared);

// ---- read-only really is read-only ----
let writeBlocked = false;
try {
  await writeDoc(fFetch, deviUrl, buildPerson(client, { ...snapshot.people[0], name: 'Hacked' }, deviUrl));
} catch { writeBlocked = true; }
ok('read access does not allow writing', writeBlocked);

// ---- upgrade to edit ----
await client.universalAccess.setAgentAccess(deviUrl, friend.webId,
  { read: true, append: true, write: true }, { fetch: oFetch });
let wrote = false;
try {
  const edited = { ...snapshot.people[0], name: 'Devi', shirt: { ...snapshot.people[0].shirt, size: '16' } };
  await writeDoc(fFetch, deviUrl, buildPerson(client, edited, deviUrl));
  wrote = true;
} catch (e) { console.log('   write error:', String(e.message ?? e).slice(0, 600)); }
ok('edit access allows writing', wrote);

// ---- what the owner's UI would list ----
const listed = await client.universalAccess.getAgentAccessAll(deviUrl, { fetch: oFetch });
const entry = listed?.[friend.webId];
ok('owner can list who has access', !!entry && entry.read && entry.write);

// ---- revoke ----
await client.universalAccess.setAgentAccess(deviUrl, friend.webId,
  { read: false, append: false, write: false, controlRead: false, controlWrite: false }, { fetch: oFetch });
let revoked = false;
try { await client.getSolidDataset(deviUrl, { fetch: fFetch }); } catch { revoked = true; }
ok('revoking really removes access', revoked);

console.log(fails ? `\n${fails} FAILED` : '\nall live-pod checks passed');
process.exit(fails ? 1 : 0);
