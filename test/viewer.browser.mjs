/* Opens a real published link in a real browser, in a profile that already
   has its own wardrobe — because the visitor may well be a user of the app,
   and a shared view must not touch what is theirs. */
import puppeteer from 'puppeteer-core';
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';
import { buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair } from '../node_modules/@inrupt/solid-client-authn-core/dist/index.mjs';
import { buildShare } from '../src/lib/rdf.js';

const SERVER = 'http://localhost:3111';
const APP = 'http://localhost:5273/';
const OUT = process.env.OUT || new URL('.', import.meta.url).pathname;
const RUN = Date.now().toString(36);
let fails = 0;
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (u, t) => (await fetch(u, { headers: t ? { authorization: `CSS-Account-Token ${t}` } : {} })).json();
const post = async (u, t, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `CSS-Account-Token ${t}` } : {}) }, body: JSON.stringify(b ?? {}) })).json();

const idx = await get(`${SERVER}/.account/`);
const cr = await post(idx.controls.account.create, null);
const acct = await get(`${SERVER}/.account/`, cr.authorization);
await post(acct.controls.password.create, cr.authorization, { email: `b-${RUN}@x.invalid`, password: 'sekret' });
const podRes = await post(acct.controls.account.pod, cr.authorization, { name: `vb${RUN}` });
const withPod = await get(`${SERVER}/.account/`, cr.authorization);
const cc = await post(withPod.controls.account.clientCredentials, cr.authorization, { name: 't', webId: podRes.webId });

const dpopKey = await generateDpopKeyPair();
const tokenUrl = `${SERVER}/.oidc/token`;
const basic = Buffer.from(`${encodeURIComponent(cc.id)}:${encodeURIComponent(cc.secret)}`).toString('base64');
const tok = await (await fetch(tokenUrl, { method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey) }, body: 'grant_type=client_credentials&scope=webid' })).json();
const oFetch = await buildAuthenticatedFetch(tok.access_token, { dpopKey });

const people = [
  { id: 'devi', name: 'Devi', chalk: 'rose', birthday: '2016-09-22', added: '2025-01-04T08:00:00.000Z',
    updated: '2026-06-01T10:30:00.000Z', revisions: [],
    glasses: { size: '46-16-125', brand: 'Warby Parker', note: '', pdMm: 54.5, rxDate: '2026-02-10',
      od: { sph: -1.75, cyl: -0.5, axis: 175, add: null }, os: { sph: -1.5, cyl: null, axis: null, add: null },
      updated: '2026-02-11T17:04:00.000Z', revisions: [] },
    shirt: { size: '10', brand: 'Hanna', note: '', chestCm: 71, sleeveCm: 50, neckCm: null, updated: '2026-06-20T11:00:00.000Z', revisions: [] },
    pants: { size: '10 slim', brand: '', note: '', waistCm: 60, inseamCm: 60, hipCm: null, updated: '2026-06-20T11:02:00.000Z', revisions: [] },
    shoes: { size: '4', system: 'US', width: '', footCm: 22.4, brand: '', note: '', updated: '2026-05-05T09:00:00.000Z', revisions: [] },
    vitals: [] },
  { id: 'ravi', name: 'Ravi', chalk: 'green', birthday: '2021-02-03', added: '2025-01-04T08:00:00.000Z',
    updated: '2026-05-02T10:00:00.000Z', revisions: [],
    shirt: { size: '5T', brand: '', note: '', chestCm: 57, sleeveCm: 38, neckCm: null, updated: '2026-05-02T10:00:00.000Z', revisions: [] },
    pants: { size: '5T', brand: '', note: '', waistCm: 53, inseamCm: 43, hipCm: null, updated: '2026-05-02T10:00:00.000Z', revisions: [] },
    shoes: { size: '11C', system: 'US', width: 'W', footCm: 17.8, brand: 'See Kai Run', note: '', updated: '2026-05-02T10:00:00.000Z', revisions: [] },
    vitals: [] }
];

const shareUrl = `${podRes.pod}wardrobe/shared/${crypto.randomUUID()}.ttl`;
let ds = client.createSolidDataset();
for (const t of client.getThingAll(buildShare(client, shareUrl, people, { units: 'metric', sharedBy: podRes.webId, at: Date.now() }))) ds = client.setThing(ds, t);
await client.saveSolidDatasetAt(shareUrl, ds, { fetch: oFetch });
await client.universalAccess.setPublicAccess(shareUrl, { read: true, write: false, append: false }, { fetch: oFetch });
console.log('published:', shareUrl, '\n');

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const p = await browser.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

// the visitor already uses the app for their own family
const MINE = JSON.stringify({ version: 2, updatedAt: '2026-01-01T00:00:00.000Z', units: 'imperial',
  people: [{ id: 'mine', name: 'Mine', chalk: 'blue', birthday: '', added: '2025-01-01T00:00:00.000Z', updated: '2025-01-01T00:00:00.000Z', revisions: [],
    shirt: { size: 'XL', brand: '', note: '', chestCm: 110, sleeveCm: null, neckCm: null, updated: '2025-06-01T00:00:00.000Z', revisions: [] }, vitals: [] }] });
await p.goto(APP, { waitUntil: 'networkidle0' });
await p.evaluate((v) => localStorage.setItem('solidsilhouettes.doc.v1', v), MINE);

await p.goto(`${APP}?view=${encodeURIComponent(shareUrl)}`, { waitUntil: 'networkidle0' });
await wait(3000);

const seen = await p.evaluate(() => ({
  tag: document.querySelector('.rail .tag')?.textContent.replace(/\s+/g, ' ').trim(),
  name: document.querySelector('.stage-name')?.textContent,
  roster: [...document.querySelectorAll('.roster-list .pname')].map((e) => e.textContent.trim()),
  specs: [...document.querySelectorAll('.spec-value')].map((e) => e.textContent.trim()),
  detail: document.querySelector('.spec-detail')?.textContent.replace(/\s+/g, ' ').trim(),
  buttons: document.querySelectorAll('.spec button, .spec[role=button]').length,
  editTags: [...document.querySelectorAll('.stage-head .tag')].map((e) => e.textContent.trim()),
  addReading: !!document.querySelector('.vitals-head .btn'),
  vitalsBlock: !!document.querySelector('.vitals'),
  foot: !!document.querySelector('.viewer-foot')
}));

ok('viewer renders the shared wardrobe', seen.name === 'Devi', seen.name);
ok('rail says it is shared with you', /shared with you/i.test(seen.tag ?? ''), seen.tag);
ok('both shared people listed', seen.roster.join() === 'Devi,Ravi', seen.roster.join());
ok('sizes render', seen.specs.includes('46-16-125') && seen.specs.includes('10'), seen.specs.join(' | '));
ok('prescription renders', /−?-1\.75 -0\.50 ×175/.test(seen.detail ?? ''), seen.detail);
ok('nothing is editable', seen.buttons === 0 && seen.editTags.length === 0, `${seen.buttons} buttons, tags: ${seen.editTags.join()}`);
ok('no add-reading control', !seen.addReading);
ok('vitals block hidden when none were shared', !seen.vitalsBlock);
ok('footer explains what this is', seen.foot);

// the visitor's own data must be exactly as it was
const mineAfter = await p.evaluate(() => localStorage.getItem('solidsilhouettes.doc.v1'));
ok('the visitor\'s own wardrobe is untouched', mineAfter === MINE);
ok('no pod connection was attempted', !(await p.evaluate(() => localStorage.getItem('solidsilhouettes.pod.wanted'))));

await p.screenshot({ path: `${OUT}/11-viewer.png` });

// a withdrawn link
await client.deleteSolidDataset(shareUrl, { fetch: oFetch });
await p.goto(`${APP}?view=${encodeURIComponent(shareUrl)}`, { waitUntil: 'networkidle0' });
await wait(2500);
const dead = await p.evaluate(() => document.querySelector('.empty-state p')?.textContent.trim());
ok('a withdrawn link says so', /withdrawn|did not open/i.test(dead ?? ''), dead);
await p.screenshot({ path: `${OUT}/12-viewer-gone.png` });

console.log('\npage errors:', errs.length ? errs.slice(0, 4) : 'none');
console.log(fails ? `${fails} FAILED` : 'all viewer checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
