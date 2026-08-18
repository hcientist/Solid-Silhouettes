/* The pod copy is Turtle: an index that lists who is in the wardrobe, and
   one document per person holding their garments, readings, and the values
   those records used to hold.

   One document per person is not tidiness — it is what makes sharing work.
   Access control in Solid is granted per resource, so "let their optician
   read Devi's prescription, and nothing else" is only expressible if Devi
   is a resource of her own.

   Everything is a named node — no blank nodes — so a revision or a
   prescription can be linked to, quoted, and patched on its own. Where a
   published vocabulary says the thing plainly (a person's name, when a
   record changed) it is used; the rest is minted under SS below, with the
   unit baked into the predicate so a number never needs a companion
   triple to be read correctly. */

import { REGIONS, EYES, RX_FIELDS, regionById } from './regions.js';

export const SS = 'https://solidsilhouettes.app/ns#';
const VCARD = 'http://www.w3.org/2006/vcard/ns#';
const DCT = 'http://purl.org/dc/terms/';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export const T = {
  Wardrobe: SS + 'Wardrobe',
  SharedView: SS + 'SharedView',
  Wearer: SS + 'Wearer',
  Individual: VCARD + 'Individual',
  Garment: SS + 'Garment',
  Eyewear: SS + 'Eyewear',
  Prescription: SS + 'Prescription',
  Reading: SS + 'Reading',
  Revision: SS + 'Revision'
};

const P = {
  units: SS + 'units',
  wearer: SS + 'wearer',
  chalk: SS + 'chalk',
  garment: SS + 'garment',
  reading: SS + 'reading',
  piece: SS + 'piece',
  labelSize: SS + 'labelSize',
  brand: SS + 'brand',
  note: SS + 'note',
  priorVersion: SS + 'priorVersion',
  rightEye: SS + 'rightEye',
  leftEye: SS + 'leftEye',
  takenOn: SS + 'takenOn',
  heightCm: SS + 'heightCm',
  weightKg: SS + 'weightKg',
  fn: VCARD + 'fn',
  bday: VCARD + 'bday',
  primaryTopic: FOAF + 'primaryTopic',
  creator: DCT + 'creator',
  created: DCT + 'created',
  modified: DCT + 'modified',
  date: DCT + 'date'
};

/* Field keys that read better under a name of their own. Anything not
   listed becomes ss:<key>, so adding a field to REGIONS needs no change
   here — chestCm, inseamCm and pdMm all carry their unit already. */
const RENAMED = { system: 'sizeSystem', width: 'widthLabel', rxDate: 'prescribedOn' };
const predFor = (key) => SS + (RENAMED[key] ?? key);

const RX_PRED = { sph: SS + 'sphere', cyl: SS + 'cylinder', axis: SS + 'axis', add: SS + 'addPower' };

const isSet = (v) => v != null && v !== '';
const asDate = (ymd) => new Date(`${ymd}T12:00:00.000Z`);
const ymd = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : '');
const stamp = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString() : null);

/** Each person gets their own document, named for their id. */
export const personDocUrl = (base, personId) => `${base.replace(/\/?$/, '/')}${personId}.ttl`;

/* ---------------------------------------------------------------- write */

/** The index: units, when the wardrobe last changed, and who is in it. */
export function buildIndex(client, snapshot, indexUrl, base) {
  const { createSolidDataset, createThing, buildThing, setThing } = client;

  const wardrobe = buildThing(createThing({ url: indexUrl }))
    .addUrl(RDF_TYPE, T.Wardrobe)
    .addStringNoLocale(P.units, snapshot.units);
  if (snapshot.updatedAt) wardrobe.addDatetime(P.modified, new Date(snapshot.updatedAt));

  for (const person of snapshot.people) {
    wardrobe.addUrl(P.wearer, `${personDocUrl(base, person.id)}#${person.id}`);
  }
  return setThing(createSolidDataset(), wardrobe.build());
}

/** A public, read-only copy of some of the wardrobe, whole in one document.

    It is a copy on purpose. The link has to be readable by someone with no
    WebID, which in Solid means readable by everyone — so what goes public is
    a separate document holding exactly what was shared, and the real records
    and the wardrobe index stay private and untouched. */
export function buildShare(client, docUrl, people, { units, sharedBy, at }) {
  const { createSolidDataset, createThing, buildThing, setThing, getThingAll } = client;
  let ds = createSolidDataset();

  const view = buildThing(createThing({ url: docUrl }))
    .addUrl(RDF_TYPE, T.Wardrobe)
    .addUrl(RDF_TYPE, T.SharedView)
    .addStringNoLocale(P.units, units)
    .addDatetime(P.modified, new Date(at ?? Date.now()));
  if (sharedBy) view.addUrl(P.creator, sharedBy);

  for (const person of people) {
    view.addUrl(P.wearer, `${docUrl}#${person.id}`);
    // Everyone lands in this one document, which is the layout readWardrobe
    // already handles; drop the per-document subject so there is one topic.
    for (const t of getThingAll(buildPerson(client, person, docUrl, { topic: false }))) {
      ds = setThing(ds, t);
    }
  }

  return setThing(ds, view.build());
}

/** One person, whole: their details, garments, prescriptions and readings. */
export function buildPerson(client, person, docUrl, { topic = true } = {}) {
  const { createSolidDataset, createThing, buildThing, setThing } = client;
  let ds = createSolidDataset();

  const ref = (n) => `${docUrl}#${n}`;
  const name = (n) => createThing({ url: ref(n) });
  const put = (thing) => {
    ds = setThing(ds, thing);
  };

  // A recipient handed only this URL should land on the person, not guess.
  if (topic) {
    put(buildThing(createThing({ url: docUrl })).addUrl(P.primaryTopic, ref(person.id)).build());
  }

  const p = buildThing(name(person.id))
    .addUrl(RDF_TYPE, T.Wearer)
    .addUrl(RDF_TYPE, T.Individual)
    .addStringNoLocale(P.fn, person.name)
    .addStringNoLocale(P.chalk, person.chalk);
  if (isSet(person.birthday)) p.addDate(P.bday, asDate(person.birthday));
  if (person.added) p.addDatetime(P.created, new Date(person.added));
  if (person.updated) p.addDatetime(P.modified, new Date(person.updated));

  (person.revisions ?? []).forEach((rev, i) => {
    const id = `${person.id}-h${i}`;
    p.addUrl(P.priorVersion, ref(id));
    const r = buildThing(name(id)).addUrl(RDF_TYPE, T.Revision).addDatetime(P.date, new Date(rev.at));
    if (isSet(rev.name)) r.addStringNoLocale(P.fn, rev.name);
    if (isSet(rev.chalk)) r.addStringNoLocale(P.chalk, rev.chalk);
    if (isSet(rev.birthday)) r.addDate(P.bday, asDate(rev.birthday));
    put(r.build());
  });

  for (const region of REGIONS) {
    const g = person[region.id];
    if (!g?.updated) continue;
    const gid = `${person.id}-${region.id}`;
    p.addUrl(P.garment, ref(gid));

    const gt = buildThing(name(gid))
      .addUrl(RDF_TYPE, T.Garment)
      .addStringNoLocale(P.piece, region.id)
      .addDatetime(P.modified, new Date(g.updated));
    if (region.rx) gt.addUrl(RDF_TYPE, T.Eyewear);
    writeValues(gt, region, g, gid, put, name, buildThing, ref);

    (g.revisions ?? []).forEach((rev, i) => {
      const rid = `${gid}-h${i}`;
      gt.addUrl(P.priorVersion, ref(rid));
      const rt = buildThing(name(rid))
        .addUrl(RDF_TYPE, T.Revision)
        .addStringNoLocale(P.piece, region.id)
        .addDatetime(P.date, new Date(rev.at));
      writeValues(rt, region, rev, rid, put, name, buildThing, ref);
      put(rt.build());
    });

    put(gt.build());
  }

  for (const v of person.vitals) {
    const vid = `${person.id}-v-${v.date}`;
    p.addUrl(P.reading, ref(vid));
    const vt = buildThing(name(vid)).addUrl(RDF_TYPE, T.Reading).addDate(P.takenOn, asDate(v.date));
    if (isSet(v.heightCm)) vt.addDecimal(P.heightCm, Number(v.heightCm));
    if (isSet(v.weightKg)) vt.addDecimal(P.weightKg, Number(v.weightKg));
    // An imported reading has no real entry time, so none is written and
    // its absence on the way back in means the same thing.
    if (v.recordedAt && !v.approx) vt.addDatetime(P.created, new Date(v.recordedAt));

    (v.revisions ?? []).forEach((rev, i) => {
      const rid = `${vid}-h${i}`;
      vt.addUrl(P.priorVersion, ref(rid));
      const rt = buildThing(name(rid)).addUrl(RDF_TYPE, T.Revision).addDatetime(P.date, new Date(rev.at));
      if (isSet(rev.heightCm)) rt.addDecimal(P.heightCm, Number(rev.heightCm));
      if (isSet(rev.weightKg)) rt.addDecimal(P.weightKg, Number(rev.weightKg));
      put(rt.build());
    });

    put(vt.build());
  }

  put(p.build());
  return ds;
}

/** The versioned payload of a garment, shared by the record and its revisions. */
function writeValues(builder, region, values, ownerId, put, name, buildThing, ref) {
  if (isSet(values.size)) builder.addStringNoLocale(P.labelSize, values.size);
  if (isSet(values.brand)) builder.addStringNoLocale(P.brand, values.brand);
  if (isSet(values.note)) builder.addStringNoLocale(P.note, values.note);

  for (const f of region.fields) {
    const v = values[f.k];
    if (!isSet(v)) continue;
    if (f.kind === 'length' || f.kind === 'mm') builder.addDecimal(predFor(f.k), Number(v));
    else if (f.kind === 'date') builder.addDate(predFor(f.k), asDate(v));
    else builder.addStringNoLocale(predFor(f.k), String(v));
  }

  if (!region.rx) return;
  for (const eye of EYES) {
    const rx = values[eye.k];
    if (!rx || !RX_FIELDS.some((f) => isSet(rx[f.k]))) continue;
    const eid = `${ownerId}-${eye.k}`;
    builder.addUrl(eye.k === 'od' ? P.rightEye : P.leftEye, ref(eid));
    const et = buildThing(name(eid)).addUrl(RDF_TYPE, T.Prescription);
    for (const f of RX_FIELDS) {
      if (!isSet(rx[f.k])) continue;
      if (f.integer) et.addInteger(RX_PRED[f.k], Math.round(Number(rx[f.k])));
      else et.addDecimal(RX_PRED[f.k], Number(rx[f.k]));
    }
    put(et.build());
  }
}

/* ----------------------------------------------------------------- read */

/** Which documents a wardrobe index points into, so they can be fetched.
    Returns [] for the older single-document layout, where the people are
    already in the index itself. */
export function wearerDocs(client, indexDs, indexUrl) {
  const wardrobe = client
    .getThingAll(indexDs)
    .find((t) => client.getUrlAll(t, RDF_TYPE).includes(T.Wardrobe));
  if (!wardrobe) return [];
  const docs = new Set();
  for (const url of client.getUrlAll(wardrobe, P.wearer)) {
    const doc = url.split('#')[0];
    if (doc && doc !== indexUrl) docs.add(doc);
  }
  return [...docs];
}

/** Reads across however many documents the wardrobe is spread over, so the
    single-document layout and the split one come back the same shape. */
export function readWardrobe(client, datasets) {
  const { getThingAll, getThing, getUrlAll, getStringNoLocale, getDecimal, getInteger, getDate, getDatetime } = client;
  const all = datasets.filter(Boolean);

  let wardrobe = null;
  for (const ds of all) {
    wardrobe = getThingAll(ds).find((t) => getUrlAll(t, RDF_TYPE).includes(T.Wardrobe));
    if (wardrobe) break;
  }
  if (!wardrobe) return null;

  /** A subject may live in any of the fetched documents; getThing gives
      null for one that is not in a dataset, so the first hit wins. */
  const at = (url) => {
    if (!url) return null;
    for (const ds of all) {
      const t = getThing(ds, url);
      if (t) return t;
    }
    return null;
  };
  const str = (t, p) => (t ? getStringNoLocale(t, p) : null);
  const dec = (t, p) => (t ? getDecimal(t, p) : null);

  const people = [];
  for (const url of getUrlAll(wardrobe, P.wearer)) {
    const t = at(url);
    if (!t) continue; // a person we were not given access to, or could not fetch

    const person = {
      id: url.split('#').pop(),
      name: str(t, P.fn) ?? 'Unnamed',
      chalk: str(t, P.chalk) ?? 'blue',
      birthday: ymd(getDate(t, P.bday)),
      added: stamp(getDatetime(t, P.created)) ?? new Date().toISOString(),
      updated: stamp(getDatetime(t, P.modified)),
      revisions: [],
      vitals: []
    };
    person.updated ??= person.added;

    for (const rurl of getUrlAll(t, P.priorVersion)) {
      const r = at(rurl);
      if (!r) continue;
      person.revisions.push({
        at: stamp(getDatetime(r, P.date)),
        name: str(r, P.fn) ?? '',
        chalk: str(r, P.chalk) ?? '',
        birthday: ymd(getDate(r, P.bday))
      });
    }
    person.revisions.sort(byNewest);

    for (const gurl of getUrlAll(t, P.garment)) {
      const g = at(gurl);
      if (!g) continue;
      const region = regionById(str(g, P.piece));
      if (!region) continue;

      const record = readValues(region, g);
      record.updated = stamp(getDatetime(g, P.modified));
      record.revisions = getUrlAll(g, P.priorVersion)
        .map(at)
        .filter(Boolean)
        .map((r) => ({ ...readValues(region, r), at: stamp(getDatetime(r, P.date)) }))
        .sort(byNewest);
      person[region.id] = record;
    }

    for (const vurl of getUrlAll(t, P.reading)) {
      const v = at(vurl);
      if (!v) continue;
      const date = ymd(getDate(v, P.takenOn));
      if (!date) continue;
      const entered = stamp(getDatetime(v, P.created));
      person.vitals.push({
        date,
        heightCm: dec(v, P.heightCm),
        weightKg: dec(v, P.weightKg),
        recordedAt: entered ?? `${date}T12:00:00.000Z`,
        approx: !entered,
        revisions: getUrlAll(v, P.priorVersion)
          .map(at)
          .filter(Boolean)
          .map((r) => ({
            at: stamp(getDatetime(r, P.date)),
            heightCm: dec(r, P.heightCm),
            weightKg: dec(r, P.weightKg)
          }))
          .sort(byNewest)
      });
    }
    person.vitals.sort((a, b) => (a.date < b.date ? 1 : -1));

    people.push(person);
  }

  return {
    version: 3,
    shared: getUrlAll(wardrobe, RDF_TYPE).includes(T.SharedView),
    sharedBy: getUrlAll(wardrobe, P.creator)[0] ?? null,
    units: getStringNoLocale(wardrobe, P.units) === 'imperial' ? 'imperial' : 'metric',
    updatedAt: stamp(getDatetime(wardrobe, P.modified)) ?? new Date().toISOString(),
    people
  };

  function readValues(region, t) {
    const out = {
      size: str(t, P.labelSize) ?? '',
      brand: str(t, P.brand) ?? '',
      note: str(t, P.note) ?? ''
    };
    for (const f of region.fields) {
      const pred = predFor(f.k);
      if (f.kind === 'length' || f.kind === 'mm') out[f.k] = dec(t, pred);
      else if (f.kind === 'date') out[f.k] = ymd(getDate(t, pred));
      else out[f.k] = str(t, pred) ?? (f.kind === 'choice' ? f.options[0] : '');
    }
    if (region.rx) {
      for (const eye of EYES) {
        const e = at(getUrlAll(t, eye.k === 'od' ? P.rightEye : P.leftEye)[0]);
        out[eye.k] = {
          sph: e ? getDecimal(e, RX_PRED.sph) : null,
          cyl: e ? getDecimal(e, RX_PRED.cyl) : null,
          axis: e ? getInteger(e, RX_PRED.axis) : null,
          add: e ? getDecimal(e, RX_PRED.add) : null
        };
      }
    }
    return out;
  }
}

const byNewest = (a, b) => (String(a.at) < String(b.at) ? 1 : -1);
