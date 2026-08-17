/* One place that turns a stored record — current or historical — into
   words. The spec card, the revision list and the ledger all read the
   same way because they all come through here. */

import { EYES } from './regions.js';
import { fmtLen, fmtMm, fmtRx, fmtDate } from './units.js';

/** The headline value: what you would read off the label. */
export function headline(values, region) {
  if (!values) return null;
  if (region.id === 'shoes' && values.size && values.system) return `${values.size} ${values.system}`;
  return values.size || null;
}

/** Everything else worth showing, as label/value pairs. */
export function details(values, region, units) {
  const out = [];
  for (const f of region.fields) {
    if (f.k === 'system') continue; // already folded into the headline
    const v = values?.[f.k];
    if (v == null || v === '') continue;
    if (f.kind === 'length') out.push([f.label, fmtLen(v, units)]);
    else if (f.kind === 'mm') out.push([f.label, fmtMm(v)]);
    else if (f.kind === 'date') out.push([f.label, fmtDate(v)]);
    else out.push([f.label, String(v)]);
  }
  if (region.rx) {
    for (const e of EYES) {
      const rx = fmtRx(values?.[e.k]);
      if (rx) out.push([e.short, rx]);
    }
  }
  if (values?.brand) out.push(['Fits', values.brand]);
  return out;
}

/** A single line, for revision rows and the ledger. */
export function oneLine(values, region, units) {
  const head = headline(values, region);
  const rest = details(values, region, units).map(([l, v]) => `${l} ${v}`);
  if (head && rest.length) return `${head} · ${rest.join(' · ')}`;
  if (head) return head;
  if (rest.length) return rest.join(' · ');
  return 'cleared';
}
