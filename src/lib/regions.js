/* The shape of a record: which pieces exist, and what each one holds.
   Plain data with no reactivity, so the RDF layer and the formatters can
   read it without dragging the store in behind them. */

/* A tailor's chalk triangle set. One colour per person, and the same
   colour keys them everywhere: roster, silhouette, nest, ledger. */
export const CHALKS = [
  { id: 'blue', hex: '#7fb0d9' },
  { id: 'yellow', hex: '#e9c56b' },
  { id: 'rose', hex: '#e2969f' },
  { id: 'green', hex: '#9bc98d' },
  { id: 'violet', hex: '#bfa5dc' },
  { id: 'ochre', hex: '#e4a273' }
];

export const chalkHex = (id) => (CHALKS.find((c) => c.id === id) || CHALKS[0]).hex;

/* An optical prescription is written per eye, in the optician's own
   order and abbreviations. Kept that way so it can be copied straight
   off the script without translation. */
export const EYES = [
  { k: 'od', short: 'OD', label: 'Right eye (OD)' },
  { k: 'os', short: 'OS', label: 'Left eye (OS)' }
];

export const RX_FIELDS = [
  { k: 'sph', label: 'SPH', step: 0.25 },
  { k: 'cyl', label: 'CYL', step: 0.25 },
  { k: 'axis', label: 'AXIS', step: 1, integer: true },
  { k: 'add', label: 'ADD', step: 0.25 }
];

/* Four pieces, four keyed callouts, read down the figure. Fields are
   declared here so one dialog can edit any of them. */
export const REGIONS = [
  {
    id: 'glasses',
    notePlaceholder: 'Left lens scratched. Ask about the anti-glare coat.',
    key: 'A',
    label: 'Glasses',
    verb: 'Glasses',
    hint: 'Frames, and the numbers on the script.',
    sizeLabel: 'Frame size',
    sizeHint: '52-18-140',
    rx: true,
    fields: [
      { k: 'pdMm', kind: 'mm', label: 'PD' },
      { k: 'rxDate', kind: 'date', label: 'Script dated' }
    ]
  },
  {
    id: 'shirt',
    notePlaceholder: 'Runs long in the sleeve. Size up in knits.',
    key: 'B',
    label: 'Shirt',
    verb: 'Shirt size',
    hint: 'Tops, jackets, anything with sleeves.',
    sizeHint: 'S, M, 10, 32R…',
    fields: [
      { k: 'chestCm', kind: 'length', label: 'Chest' },
      { k: 'sleeveCm', kind: 'length', label: 'Sleeve' },
      { k: 'neckCm', kind: 'length', label: 'Neck' }
    ]
  },
  {
    id: 'pants',
    notePlaceholder: 'Waistband gapes; needs a belt.',
    key: 'C',
    label: 'Pants',
    verb: 'Pants size',
    hint: 'Trousers, jeans, skirts.',
    sizeHint: '32/34, 8, 4T…',
    fields: [
      { k: 'waistCm', kind: 'length', label: 'Waist' },
      { k: 'inseamCm', kind: 'length', label: 'Inseam' },
      { k: 'hipCm', kind: 'length', label: 'Hip' }
    ]
  },
  {
    id: 'shoes',
    notePlaceholder: 'Half a size up in trainers.',
    key: 'D',
    label: 'Shoes',
    verb: 'Shoe size',
    hint: 'Whichever scale the box is printed in.',
    sizeHint: '9, 42, 13C…',
    fields: [
      { k: 'system', kind: 'choice', label: 'Scale', options: ['US', 'UK', 'EU', 'JP'] },
      { k: 'width', kind: 'text', label: 'Width', placeholder: 'D, wide…' },
      { k: 'footCm', kind: 'length', label: 'Foot' }
    ]
  }
];

export const regionById = (id) => REGIONS.find((r) => r.id === id);

export const blankRx = () => ({ sph: null, cyl: null, axis: null, add: null });

export function blankGarment(region) {
  const g = { size: '', brand: '', note: '', updated: null, revisions: [] };
  for (const f of region.fields) {
    g[f.k] = f.kind === 'choice' ? f.options[0] : f.kind === 'date' || f.kind === 'text' ? '' : null;
  }
  if (region.rx) for (const e of EYES) g[e.k] = blankRx();
  return g;
}

/** The versioned part of a garment: everything except its bookkeeping. */
export function garmentValues(g, region) {
  const out = { size: g.size ?? '', brand: g.brand ?? '', note: g.note ?? '' };
  for (const f of region.fields) out[f.k] = g[f.k] ?? null;
  if (region.rx) for (const e of EYES) out[e.k] = { ...blankRx(), ...(g[e.k] ?? {}) };
  return out;
}
