/* Round-trips a wardrobe through the real @inrupt/solid-client serializer by
   standing in a fake pod: PUT stores Turtle per URL, GET hands it back.
   Also checks that a pod written in the older single-document layout still
   reads, since that is a compatibility claim rather than a round trip. */
import * as client from '../node_modules/@inrupt/solid-client/dist/index.mjs';
import { buildIndex, buildPerson, readWardrobe, wearerDocs, personDocUrl } from '../src/lib/rdf.js';

const BASE = 'https://pod.example/clothes/';
const INDEX = BASE + 'wardrobe.ttl';
const store = new Map();

/* A real response carries the URL it came from, and Turtle parsing needs it
   as the base for relative IRIs like <> and <#id>. A constructed Response
   has an empty url, so set it — otherwise the harness silently tests only
   the absolute-IRI case. */
const respond = (body, status, url) => {
  const res = new Response(body, { status, headers: { 'content-type': 'text/turtle' } });
  Object.defineProperty(res, 'url', { value: url });
  return res;
};

const fakeFetch = async (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  const key = url.toString();
  if (method === 'PUT' || method === 'PATCH') {
    store.set(key, typeof init.body === 'string' ? init.body : await new Response(init.body).text());
    return respond(null, 201, key);
  }
  if (!store.has(key)) return respond('Not Found', 404, key);
  return respond(store.get(key), 200, key);
};

let fails = 0;
const eq = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fails++; console.log(`FAIL  ${name}\n      want ${JSON.stringify(a)}\n      got  ${JSON.stringify(b)}`); }
  else console.log(`PASS  ${name}`);
};

const snapshot = {
  version: 3, updatedAt: '2026-08-18T09:15:00.000Z', units: 'imperial',
  people: [
    {
      id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', name: 'Devi', chalk: 'rose', birthday: '2016-09-22',
      added: '2025-01-04T08:00:00.000Z', updated: '2026-06-01T10:30:00.000Z',
      revisions: [{ at: '2025-01-04T08:00:00.000Z', name: 'Devika', chalk: 'blue', birthday: '2016-09-22' }],
      glasses: {
        size: '46-16-125', brand: 'Warby Parker', note: 'Hinges loosen; retighten each term.',
        pdMm: 54.5, rxDate: '2026-02-10',
        od: { sph: -1.75, cyl: -0.5, axis: 175, add: null }, os: { sph: -1.5, cyl: null, axis: null, add: null },
        updated: '2026-02-11T17:04:00.000Z',
        revisions: [{ at: '2025-03-02T09:00:00.000Z', size: '44-15-120', brand: '', note: '', pdMm: 52,
          rxDate: '2025-02-20', od: { sph: -1.25, cyl: -0.5, axis: 170, add: null }, os: { sph: -1, cyl: null, axis: null, add: null } }]
      },
      shirt: { size: '10', brand: 'Hanna', note: 'Sleeves always short.', chestCm: 71, sleeveCm: 50, neckCm: null,
        updated: '2026-06-20T11:00:00.000Z',
        revisions: [{ at: '2025-08-01T11:00:00.000Z', size: '8', brand: '', note: '', chestCm: 66, sleeveCm: 46, neckCm: null }] },
      pants: { size: '10 slim', brand: '', note: '', waistCm: 60, inseamCm: 60, hipCm: null, updated: '2026-06-20T11:02:00.000Z', revisions: [] },
      shoes: { size: '4', system: 'UK', width: 'wide', footCm: 22.4, brand: '', note: '', updated: '2026-05-05T09:00:00.000Z', revisions: [] },
      vitals: [
        { date: '2026-08-01', weightKg: 32.1, heightCm: 141.5, recordedAt: '2026-08-03T19:20:00.000Z', approx: false,
          revisions: [{ at: '2026-08-01T20:00:00.000Z', weightKg: 32.0, heightCm: 141.0 }] },
        { date: '2026-04-03', weightKg: 30.6, heightCm: 138.2, recordedAt: '2026-04-03T12:00:00.000Z', approx: true, revisions: [] }
      ]
    },
    {
      id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', name: 'Ash', chalk: 'violet', birthday: '',
      added: '2025-01-04T08:00:00.000Z', updated: '2025-01-04T08:00:00.000Z', revisions: [],
      glasses: { size: '', brand: '', note: '', pdMm: null, rxDate: '', od: {}, os: {}, updated: null, revisions: [] },
      shirt: { size: 'L', brand: 'Carhartt', note: '', chestCm: 106, sleeveCm: 65, neckCm: 41, updated: '2026-02-02T10:00:00.000Z', revisions: [] },
      pants: { size: '34/32', brand: '', note: '', waistCm: 86, inseamCm: 81, hipCm: null, updated: '2026-02-02T10:00:00.000Z', revisions: [] },
      shoes: { size: '', system: 'US', width: '', footCm: null, brand: '', note: '', updated: null, revisions: [] },
      vitals: []
    }
  ]
};

// ---------- write the split layout ----------
for (const person of snapshot.people) {
  const url = personDocUrl(BASE, person.id);
  await client.saveSolidDatasetAt(url, buildPerson(client, person, url), { fetch: fakeFetch });
}
await client.saveSolidDatasetAt(INDEX, buildIndex(client, snapshot, INDEX, BASE), { fetch: fakeFetch });

console.log('--- documents written ---');
for (const [k, v] of store) console.log(`  ${k.replace(BASE, '')}  ${v.split('\n').length} lines`);
eq('one document per person, plus the index', 3, store.size);

// ---------- read it back the way the app does ----------
const indexDs = await client.getSolidDataset(INDEX, { fetch: fakeFetch });
const docs = wearerDocs(client, indexDs, INDEX);
eq('index points at both person documents', 2, docs.length);
eq('index itself is not refetched', false, docs.includes(INDEX));

const datasets = [indexDs];
for (const d of docs) datasets.push(await client.getSolidDataset(d, { fetch: fakeFetch }));
const back = readWardrobe(client, datasets);

const D = back.people.find((p) => p.name === 'Devi');
const A = back.people.find((p) => p.name === 'Ash');
const S = snapshot.people[0];

eq('units', 'imperial', back.units);
eq('updatedAt', snapshot.updatedAt, back.updatedAt);
eq('people count', 2, back.people.length);
eq('id survives', S.id, D.id);
eq('birthday', '2016-09-22', D.birthday);
eq('person revisions', [{ at: S.revisions[0].at, name: 'Devika', chalk: 'blue', birthday: '2016-09-22' }], D.revisions);
eq('glasses frame size', '46-16-125', D.glasses.size);
eq('glasses PD (mm, unconverted)', 54.5, D.glasses.pdMm);
eq('glasses script date', '2026-02-10', D.glasses.rxDate);
eq('rx OD', { sph: -1.75, cyl: -0.5, axis: 175, add: null }, D.glasses.od);
eq('rx OS (sparse)', { sph: -1.5, cyl: null, axis: null, add: null }, D.glasses.os);
eq('glasses revision rx OD', { sph: -1.25, cyl: -0.5, axis: 170, add: null }, D.glasses.revisions[0].od);
eq('shirt chest', 71, D.shirt.chestCm);
eq('shirt neck stays null', null, D.shirt.neckCm);
eq('shirt revision size', '8', D.shirt.revisions[0].size);
eq('shoes scale', 'UK', D.shoes.system);
eq('reading height', 141.5, D.vitals[0].heightCm);
eq('reading recordedAt', '2026-08-03T19:20:00.000Z', D.vitals[0].recordedAt);
eq('real entry time is not approximate', false, D.vitals[0].approx);
eq('imported reading stays approximate', true, D.vitals[1].approx);
eq('reading revision', [{ at: '2026-08-01T20:00:00.000Z', heightCm: 141, weightKg: 32 }], D.vitals[0].revisions);
eq('untouched garment omitted', undefined, A.glasses);
eq('Ash shirt neck', 41, A.shirt.neckCm);

// ---------- a person document stands on its own ----------
const soloUrl = personDocUrl(BASE, S.id);
const solo = await client.getSolidDataset(soloUrl, { fetch: fakeFetch });
const topic = client.getUrl(client.getThing(solo, soloUrl), 'http://xmlns.com/foaf/0.1/primaryTopic');
eq('person document names its subject', `${soloUrl}#${S.id}`, topic);
eq('a person document alone has no wardrobe', null, readWardrobe(client, [solo]));

// ---------- the older single-document layout still reads ----------
const OLD = 'https://pod.example/solidsilhouettes/wardrobe.ttl';
store.set(OLD, `
@prefix ss: <https://solidsilhouettes.app/ns#> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a ss:Wardrobe ; ss:units "metric" ;
   dcterms:modified "2026-05-01T10:00:00.000Z"^^xsd:dateTime ;
   ss:wearer <#old1> .
<#old1> a ss:Wearer, vcard:Individual ; vcard:fn "Ravi" ; ss:chalk "green" ;
   dcterms:created "2025-01-01T00:00:00.000Z"^^xsd:dateTime ;
   ss:garment <#old1-shirt> ; ss:reading <#old1-v-2026-04-01> .
<#old1-shirt> a ss:Garment ; ss:piece "shirt" ; ss:labelSize "5T" ; ss:chestCm 57.0 ;
   dcterms:modified "2026-04-02T10:00:00.000Z"^^xsd:dateTime .
<#old1-v-2026-04-01> a ss:Reading ; ss:takenOn "2026-04-01"^^xsd:date ; ss:heightCm 104.9 .
`);
const oldDs = await client.getSolidDataset(OLD, { fetch: fakeFetch });
eq('old layout needs no extra fetches', [], wearerDocs(client, oldDs, OLD));
const oldBack = readWardrobe(client, [oldDs]);
eq('old layout: person read', 'Ravi', oldBack.people[0]?.name);
eq('old layout: garment read', '5T', oldBack.people[0]?.shirt?.size);
eq('old layout: measurement read', 57, oldBack.people[0]?.shirt?.chestCm);
eq('old layout: reading read', 104.9, oldBack.people[0]?.vitals[0]?.heightCm);
eq('old layout: no entry time means approximate', true, oldBack.people[0]?.vitals[0]?.approx);

console.log(fails ? `\n${fails} FAILED` : '\nall round-trip checks passed');
process.exit(fails ? 1 : 0);
