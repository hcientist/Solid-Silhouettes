/* The storage-discovery fix, against the real server that exposed the bug.
   Mirrors findStorage() in solid.svelte.js, which cannot be imported here
   because it lives in a runes module. */
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';

const SERVER = 'http://localhost:3111';
const get = async (u, t) => (await fetch(u, { headers: t ? { authorization: `CSS-Account-Token ${t}` } : {} })).json();
const post = async (u, t, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `CSS-Account-Token ${t}` } : {}) }, body: JSON.stringify(b ?? {}) })).json();

const RUN = Date.now().toString(36);
const idx = await get(`${SERVER}/.account/`);
const cr = await post(idx.controls.account.create, null);
const acct = await get(`${SERVER}/.account/`, cr.authorization);
await post(acct.controls.password.create, cr.authorization, { email: `s-${RUN}@x.invalid`, password: 'sekret' });
const pod = await post(acct.controls.account.pod, cr.authorization, { name: `store${RUN}` });

const asContainer = (u) => u.replace(/\/?$/, '/');
async function findStorage(webId, fetch) {
  try {
    const declared = (await client.getPodUrlAll(webId, { fetch }))?.[0];
    if (declared) return asContainer(declared);
  } catch { /* */ }
  const url = new URL(webId);
  const parts = url.pathname.split('/').filter(Boolean);
  for (let depth = parts.length - 1; depth >= 0; depth--) {
    const candidate = `${url.origin}/${parts.slice(0, depth).map((p) => `${p}/`).join('')}`;
    try {
      const res = await fetch(candidate, { method: 'HEAD' });
      const link = res.headers.get('link') ?? '';
      if (/<http:\/\/www\.w3\.org\/ns\/pim\/space#Storage>\s*;\s*rel\s*=\s*"?type"?/i.test(link)) return candidate;
    } catch { /* */ }
  }
  return `${url.origin}/`;
}

let fails = 0;
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`); };

const found = await findStorage(pod.webId, fetch);
ok('finds the pod, not the server root', found === pod.pod, `${found} vs pod ${pod.pod}`);
ok('does not fall back to the origin', found !== `${SERVER}/`, found);
console.log(`\n  profile declares pim:storage? ${JSON.stringify(await client.getPodUrlAll(pod.webId, { fetch }))}`);
console.log('  so discovery had to come from the Link header.');
process.exit(fails ? 1 : 0);
