/* The pod copy is Turtle, not JSON: a wardrobe of people, each with
   garments, readings, and the values those records used to hold.

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
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const T = {
  Wardrobe: SS + 'Wardrobe',
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

/* ---------------------------------------------------------------- write */

export function buildDataset(client, snapshot, resourceUrl) {
  const { createSolidDataset, createThing, buildThing, setThing } = client;
  let ds = createSolidDataset();

  // Absolute subjects throughout, so a link and the thing it points at
  // always agree no matter how the file is later fetched.
  const ref = (n) => `${resourceUrl}#${n}`;
  const name = (n) => createThing({ url: ref(n) });
  const put = (thing) => {
    ds = setThing(ds, thing);
  };

  const wardrobe = buildThing(createThing({ url: resourceUrl }))
    .addUrl(RDF_TYPE, T.Wardrobe)
    .addStringNoLocale(P.units, snapshot.units);
  if (snapshot.updatedAt) wardrobe.addDatetime(P.modified, new Date(snapshot.updatedAt));

  for (const person of snapshot.people) {
    wardrobe.addUrl(P.wearer, ref(person.id));

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
  }

  put(wardrobe.build());
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

export function readDataset(client, ds) {
  const { getThingAll, getThing, getUrlAll, getStringNoLocale, getDecimal, getInteger, getDate, getDatetime } = client;

  const things = getThingAll(ds);
  const wardrobe = things.find((t) => getUrlAll(t, RDF_TYPE).includes(T.Wardrobe));
  if (!wardrobe) return null;

  const at = (url) => (url ? getThing(ds, url) : null);
  const str = (t, p) => (t ? getStringNoLocale(t, p) : null);
  const dec = (t, p) => (t ? getDecimal(t, p) : null);
  const int = (t, p) => (t ? getInteger(t, p) : null);

  const people = [];
  for (const url of getUrlAll(wardrobe, P.wearer)) {
    const t = at(url);
    if (!t) continue;

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

      const record = readValues(region, g, ds, client);
      record.updated = stamp(getDatetime(g, P.modified));
      record.revisions = getUrlAll(g, P.priorVersion)
        .map((u) => at(u))
        .filter(Boolean)
        .map((r) => ({ ...readValues(region, r, ds, client), at: stamp(getDatetime(r, P.date)) }))
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
          .map((u) => at(u))
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
    version: 2,
    units: getStringNoLocale(wardrobe, P.units) === 'imperial' ? 'imperial' : 'metric',
    updatedAt: stamp(getDatetime(wardrobe, P.modified)) ?? new Date().toISOString(),
    people
  };

  function readValues(region, t, ds2, c) {
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
        const eurl = getUrlAll(t, eye.k === 'od' ? P.rightEye : P.leftEye)[0];
        const e = eurl ? getThing(ds2, eurl) : null;
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
