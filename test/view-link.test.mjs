/* The public read-only link, against a real server. The whole feature rests
   on one claim — someone with no WebID can read it — and one risk: that the
   same act exposes more than intended. Both are checked here with a plain
   unauthenticated fetch, exactly what a stranger has. */
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';
import { buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair } from '../node_modules/@inrupt/solid-client-authn-core/dist/index.mjs';
import { buildShare, buildPerson, readWardrobe, personDocUrl } from '../src/lib/rdf.js';

const SERVER = 'http://localhost:3111';
const RUN = Date.now().toString(36);
let fails = 0;
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`); };

const get = async (u, t) => (await fetch(u, { headers: t ? { authorization: `CSS-Account-Token ${t}` } : {} })).json();
const post = async (u, t, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `CSS-Account-Token ${t}` } : {}) }, body: JSON.stringify(b ?? {}) })).json();

const idx = await get(`${SERVER}/.account/`);
const cr = await post(idx.controls.account.create, null);
const acct = await get(`${SERVER}/.account/`, cr.authorization);
await post(acct.controls.password.create, cr.authorization, { email: `v-${RUN}@x.invalid`, password: 'sekret' });
const podRes = await post(acct.controls.account.pod, cr.authorization, { name: `view${RUN}` });
const withPod = await get(`${SERVER}/.account/`, cr.authorization);
const cc = await post(withPod.controls.account.clientCredentials, cr.authorization, { name: 't', webId: podRes.webId });

const dpopKey = await generateDpopKeyPair();
const tokenUrl = `${SERVER}/.oidc/token`;
const basic = Buffer.from(`${encodeURIComponent(cc.id)}:${encodeURIComponent(cc.secret)}`).toString('base64');
const tok = await (await fetch(tokenUrl, {
  method: 'POST',
  headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey) },
  body: 'grant_type=client_credentials&scope=webid'
})).json();
const oFetch = await buildAuthenticatedFetch(tok.access_token, { dpopKey });

const BASE = `${podRes.pod}wardrobe/`;
const SHARED = `${BASE}shared/`;

const devi = {
  id: 'devi', name: 'Devi', chalk: 'rose', birthday: '2016-09-22',
  added: '2025-01-04T08:00:00.000Z', updated: '2026-06-01T10:30:00.000Z', revisions: [],
  glasses: { size: '46-16-125', brand: '', note: '', pdMm: 54.5, rxDate: '2026-02-10',
    od: { sph: -1.75, cyl: -0.5, axis: 175, add: null }, os: { sph: -1.5, cyl: null, axis: null, add: null },
    updated: '2026-02-11T17:04:00.000Z', revisions: [] },
  shirt: { size: '10', brand: 'Hanna', note: '', chestCm: 71, sleeveCm: 50, neckCm: null, updated: '2026-06-20T11:00:00.000Z', revisions: [] },
  pants: { size: '', brand: '', note: '', waistCm: null, inseamCm: null, hipCm: null, updated: null, revisions: [] },
  shoes: { size: '', system: 'US', width: '', footCm: null, brand: '', note: '', updated: null, revisions: [] },
  vitals: [{ date: '2026-08-01', weightKg: 32.1, heightCm: 141.5, recordedAt: '2026-08-03T19:20:00.000Z', approx: false, revisions: [] }]
};

async function writeDoc(fetch, url, fresh) {
  let target;
  try {
    target = await client.getSolidDataset(url, { fetch });
    for (const t of client.getThingAll(target)) target = client.removeThing(target, t);
  } catch { target = client.createSolidDataset(); }
  for (const t of client.getThingAll(fresh)) target = client.setThing(target, t);
  return client.saveSolidDatasetAt(url, target, { fetch });
}

// the private record, for contrast
const privateUrl = personDocUrl(BASE, devi.id);
await writeDoc(oFetch, privateUrl, buildPerson(client, devi, privateUrl));

// publish a link WITHOUT vitals
const token = crypto.randomUUID();
const shareUrl = `${SHARED}${token}.ttl`;
await writeDoc(oFetch, shareUrl, buildShare(client, shareUrl, [{ ...devi, vitals: [] }], {
  units: 'metric', sharedBy: podRes.webId, at: Date.now()
}));
await client.universalAccess.setPublicAccess(shareUrl, { read: true, write: false, append: false }, { fetch: oFetch });

// ---- a stranger: no token, no WebID, plain fetch ----
let ds = null;
try { ds = await client.getSolidDataset(shareUrl); } catch (e) { console.log('   ', String(e).slice(0, 120)); }
ok('a stranger with no WebID can read the link', !!ds);

if (ds) {
  const parsed = readWardrobe(client, [ds]);
  ok('it parses as a wardrobe', parsed?.people.length === 1, parsed?.people[0]?.name);
  ok('it is marked as a shared view', parsed?.shared === true);
  ok('it credits who published it', parsed?.sharedBy === podRes.webId);
  ok('sizes came through', parsed?.people[0].shirt.size === '10');
  ok('prescription came through', parsed?.people[0].glasses.od.sph === -1.75);
  ok('vitals were left out as asked', parsed?.people[0].vitals.length === 0);
}

// ---- what the same stranger must NOT get ----
let priv = false;
try { await client.getSolidDataset(privateUrl); priv = true; } catch { /* */ }
ok('the private record stays private', !priv);

const dirRes = await fetch(SHARED, { headers: { accept: 'text/turtle' } });
ok('the share folder cannot be listed by a stranger', !dirRes.ok, `HTTP ${dirRes.status}`);

const idxRes = await fetch(`${BASE}wardrobe.ttl`, { headers: { accept: 'text/turtle' } });
ok('the wardrobe index stays private', !idxRes.ok, `HTTP ${idxRes.status}`);

const putRes = await fetch(shareUrl, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: '<#x> <#y> <#z> .' });
ok('a stranger cannot write to the link', !putRes.ok, `HTTP ${putRes.status}`);

// ---- a second link with vitals, to prove the toggle is real ----
const t2 = crypto.randomUUID();
const url2 = `${SHARED}${t2}.ttl`;
await writeDoc(oFetch, url2, buildShare(client, url2, [devi], { units: 'metric', sharedBy: podRes.webId, at: Date.now() }));
await client.universalAccess.setPublicAccess(url2, { read: true, write: false, append: false }, { fetch: oFetch });
const p2 = readWardrobe(client, [await client.getSolidDataset(url2)]);
ok('a link may include vitals when asked', p2?.people[0].vitals[0]?.heightCm === 141.5);

// ---- the owner can enumerate their own links ----
const dir = await client.getSolidDataset(SHARED, { fetch: oFetch });
const contained = client.getContainedResourceUrlAll(dir).filter((u) => u.endsWith('.ttl'));
ok('the owner can list their own links', contained.length === 2, `${contained.length}`);

// ---- refreshing a published copy keeps it public ----
await writeDoc(oFetch, shareUrl, buildShare(client, shareUrl, [{ ...devi, shirt: { ...devi.shirt, size: '12' }, vitals: [] }], {
  units: 'metric', sharedBy: podRes.webId, at: Date.now()
}));
const after = await client.getSolidDataset(shareUrl).catch(() => null);
ok('a refreshed link is still readable by a stranger', !!after);
ok('the refresh actually updated it', readWardrobe(client, [after])?.people[0].shirt.size === '12');

// ---- withdrawing ----
await client.deleteSolidDataset(shareUrl, { fetch: oFetch });
let gone = false;
try { await client.getSolidDataset(shareUrl); } catch { gone = true; }
ok('withdrawing the link kills it', gone);

console.log(fails ? `\n${fails} FAILED` : '\nall view-link checks passed');
process.exit(fails ? 1 : 0);
