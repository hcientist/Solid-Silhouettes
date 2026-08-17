import { todayISO } from './units.js';
import {
  CHALKS,
  chalkHex,
  EYES,
  RX_FIELDS,
  REGIONS,
  regionById,
  blankRx,
  blankGarment,
  garmentValues
} from './regions.js';

// Re-exported so components have one place to import from.
export { CHALKS, chalkHex, EYES, RX_FIELDS, REGIONS, regionById, garmentValues };

const KEY = 'solidsilhouettes.doc.v1';

/** How many superseded values to keep per record before the oldest fall off. */
export const HISTORY_CAP = 24;

export function blankPerson(name, chalkId) {
  const now = new Date().toISOString();
  const p = {
    id: crypto.randomUUID(),
    name: name || 'New person',
    chalk: chalkId || CHALKS[0].id,
    birthday: '',
    vitals: [],
    added: now,
    updated: now,
    revisions: []
  };
  for (const r of REGIONS) p[r.id] = blankGarment(r);
  return p;
}

/** Fill in anything a stored record predates, without losing what it has. */
function normalisePerson(raw) {
  const p = { ...blankPerson(raw.name, raw.chalk), ...raw };
  p.id = raw.id ?? p.id;
  p.revisions = Array.isArray(raw.revisions) ? raw.revisions : [];
  p.updated = raw.updated ?? raw.added ?? p.added;
  p.vitals = (raw.vitals ?? []).map((v) => ({
    date: v.date,
    weightKg: v.weightKg ?? null,
    heightCm: v.heightCm ?? null,
    recordedAt: v.recordedAt ?? `${v.date}T12:00:00.000Z`,
    // An imported reading has no entry time; say so rather than invent one.
    approx: v.approx ?? !v.recordedAt,
    revisions: Array.isArray(v.revisions) ? v.revisions : []
  }));
  for (const r of REGIONS) {
    const g = { ...blankGarment(r), ...(raw[r.id] ?? {}) };
    g.revisions = Array.isArray(g.revisions) ? g.revisions : [];
    if (r.rx) for (const e of EYES) g[e.k] = { ...blankRx(), ...(g[e.k] ?? {}) };
    p[r.id] = g;
  }
  return p;
}

/* What gets saved, here and on the pod */
export const doc = $state({
  version: 2,
  updatedAt: null,
  units: 'metric',
  people: []
});

/* What only matters on this screen */
export const ui = $state({
  selectedId: null,
  view: 'person',
  activeRegion: null
});

export function selected() {
  return doc.people.find((p) => p.id === ui.selectedId) || null;
}

export function select(id) {
  ui.selectedId = id;
  ui.view = 'person';
}

export function addPerson(person) {
  doc.people.push(person);
  select(person.id);
  return person;
}

export function removePerson(id) {
  const i = doc.people.findIndex((p) => p.id === id);
  if (i < 0) return;
  doc.people.splice(i, 1);
  if (ui.selectedId === id) ui.selectedId = doc.people[Math.max(0, i - 1)]?.id ?? null;
}

/* ---------- versioning ----------
   Every record keeps the values it holds now plus the values it used to
   hold. A revision's `at` is the moment that value became current, so a
   record reads as a list of "this was true from then until the next one". */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function personValues(p) {
  return { name: p.name, birthday: p.birthday ?? '', chalk: p.chalk };
}

export function saveGarment(personId, regionId, values) {
  const p = doc.people.find((x) => x.id === personId);
  const region = regionById(regionId);
  if (!p || !region) return false;

  const before = garmentValues(p[regionId], region);
  const after = { ...before, ...values };
  if (same(before, after)) return false;

  const revisions = [...(p[regionId].revisions ?? [])];
  if (p[regionId].updated) revisions.unshift({ at: p[regionId].updated, ...before });

  p[regionId] = { ...after, updated: new Date().toISOString(), revisions: revisions.slice(0, HISTORY_CAP) };
  return true;
}

export function savePerson(personId, values) {
  const p = doc.people.find((x) => x.id === personId);
  if (!p) return false;

  const before = personValues(p);
  const after = { ...before, ...values };
  if (same(before, after)) return false;

  p.revisions = [{ at: p.updated ?? p.added, ...before }, ...(p.revisions ?? [])].slice(0, HISTORY_CAP);
  Object.assign(p, after, { updated: new Date().toISOString() });
  return true;
}

export function addVitals(personId, entry) {
  const p = doc.people.find((x) => x.id === personId);
  if (!p) return;
  const date = entry.date || todayISO();
  const now = new Date().toISOString();
  const i = p.vitals.findIndex((v) => v.date === date);
  const row = {
    date,
    weightKg: entry.weightKg ?? null,
    heightCm: entry.heightCm ?? null,
    recordedAt: now,
    approx: false,
    revisions: []
  };
  if (i >= 0) {
    const old = p.vitals[i];
    row.revisions = [
      { at: old.recordedAt, weightKg: old.weightKg, heightCm: old.heightCm },
      ...(old.revisions ?? [])
    ].slice(0, HISTORY_CAP);
    p.vitals[i] = row;
  } else {
    p.vitals.push(row);
  }
  p.vitals.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

export function removeVitals(personId, date) {
  const p = doc.people.find((x) => x.id === personId);
  if (!p) return;
  p.vitals = p.vitals.filter((v) => v.date !== date);
}

/** Current value first, then every superseded one, newest to oldest. */
export function versionsOf(record, region) {
  if (!record?.updated) return [];
  const head = { at: record.updated, current: true, values: garmentValues(record, region) };
  const past = (record.revisions ?? []).map((r) => ({ at: r.at, current: false, values: r }));
  return [head, ...past];
}

/** Every change anyone made, newest first. The workroom's job book. */
export function ledger(limit = 250) {
  const out = [];
  for (const p of doc.people) {
    const who = { personId: p.id, person: p.name, chalk: p.chalk };

    if (p.updated && (p.revisions ?? []).length) {
      out.push({ ...who, at: p.updated, kind: 'person', values: personValues(p) });
      for (const r of p.revisions) out.push({ ...who, at: r.at, kind: 'person', values: r });
    }

    for (const region of REGIONS) {
      for (const v of versionsOf(p[region.id], region)) {
        out.push({ ...who, at: v.at, kind: region.id, region, values: v.values });
      }
    }

    for (const v of p.vitals) {
      out.push({ ...who, at: v.recordedAt, approx: v.approx, kind: 'vitals', on: v.date, values: v });
      for (const r of v.revisions ?? []) {
        out.push({ ...who, at: r.at, kind: 'vitals', on: v.date, values: r });
      }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

/** Most recent reading of a field, since a person may be weighed and
    measured on different days. */
export function latest(person, field) {
  for (const v of person?.vitals ?? []) if (v[field] != null) return v;
  return null;
}

export const latestHeight = (p) => latest(p, 'heightCm')?.heightCm ?? null;
export const latestWeight = (p) => latest(p, 'weightKg')?.weightKg ?? null;

export function hasSizes(person, regionId) {
  const g = person?.[regionId];
  const r = regionById(regionId);
  if (!g || !r) return false;
  if (g.size || g.brand || g.note) return true;
  if (r.fields.some((f) => g[f.k] != null && g[f.k] !== '' && !(f.kind === 'choice' && g[f.k] === f.options[0])))
    return true;
  if (r.rx) return EYES.some((e) => RX_FIELDS.some((f) => g[e.k]?.[f.k] != null));
  return false;
}

/** One-line summary for the roster, in the order you'd read it off a label */
export function specLine(person) {
  const bits = [];
  for (const r of REGIONS) {
    const s = person[r.id]?.size;
    if (s) bits.push(`${r.key} ${s}`);
  }
  return bits.length ? bits.join('  ·  ') : 'no sizes yet';
}

/** When anything about this person last changed. */
export function personTouched(person) {
  const stamps = [person.updated, ...REGIONS.map((r) => person[r.id]?.updated), ...person.vitals.map((v) => v.recordedAt)];
  return stamps.filter(Boolean).sort().pop() ?? null;
}

/* ---------- persistence ---------- */

export function snapshot() {
  return {
    version: 2,
    updatedAt: doc.updatedAt,
    units: doc.units,
    people: JSON.parse(JSON.stringify(doc.people))
  };
}

export function replaceDoc(incoming) {
  if (!incoming || !Array.isArray(incoming.people)) return false;
  doc.units = incoming.units === 'imperial' ? 'imperial' : 'metric';
  doc.people = incoming.people.map(normalisePerson);
  doc.updatedAt = incoming.updatedAt ?? new Date().toISOString();
  if (!doc.people.some((p) => p.id === ui.selectedId)) ui.selectedId = doc.people[0]?.id ?? null;
  return true;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    replaceDoc(JSON.parse(raw));
  } catch (err) {
    console.warn('Could not read the local copy', err);
  }
}

load();
if (!ui.selectedId) ui.selectedId = doc.people[0]?.id ?? null;

let onChange = null;
/** The pod client registers here so the store never has to know it exists. */
export function watchDoc(fn) {
  onChange = fn;
}

let lastSnap = null;
$effect.root(() => {
  $effect(() => {
    // Reading these is what subscribes us to every edit below them.
    const snap = JSON.stringify({ units: doc.units, people: doc.people });
    if (snap === lastSnap) return;
    const firstRun = lastSnap === null;
    lastSnap = snap;
    if (!firstRun) doc.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot()));
    } catch (err) {
      console.warn('Could not write the local copy', err);
    }
    if (!firstRun) onChange?.();
  });
});
