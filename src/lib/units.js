/* Everything is stored metric. Imperial is a display layer, because a
   tape measure is a tape measure no matter which side you read. */

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

const FRACTIONS = ['', '¼', '½', '¾'];

/** cm -> the number you'd type in the current units */
export function lenOut(cm, u) {
  if (cm == null || cm === '') return '';
  return round(u === 'imperial' ? cm / CM_PER_IN : cm, 2);
}

/** the number you typed -> cm */
export function lenIn(v, u) {
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  return u === 'imperial' ? n * CM_PER_IN : n;
}

export function massOut(kg, u) {
  if (kg == null || kg === '') return '';
  return round(u === 'imperial' ? kg / KG_PER_LB : kg, 1);
}

export function massIn(v, u) {
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  return u === 'imperial' ? n * KG_PER_LB : n;
}

export const lenUnit = (u) => (u === 'imperial' ? 'in' : 'cm');
export const massUnit = (u) => (u === 'imperial' ? 'lb' : 'kg');

/** Tailor's notation: 38½" rather than 38.5 in */
export function fmtLen(cm, u) {
  if (cm == null) return '—';
  if (u !== 'imperial') return `${round(cm, 1)} cm`;
  const inches = cm / CM_PER_IN;
  const whole = Math.floor(inches);
  const q = Math.round((inches - whole) * 4);
  if (q === 4) return `${whole + 1}″`;
  return `${whole}${FRACTIONS[q]}″`;
}

export function fmtMass(kg, u) {
  if (kg == null) return '—';
  return u === 'imperial' ? `${round(kg / KG_PER_LB, 1)} lb` : `${round(kg, 1)} kg`;
}

/** Height gets read aloud as feet and inches, so print it that way */
export function fmtHeight(cm, u) {
  if (cm == null) return '—';
  if (u !== 'imperial') return `${round(cm, 1)} cm`;
  const total = cm / CM_PER_IN;
  const ft = Math.floor(total / 12);
  const inch = Math.round(total - ft * 12);
  return inch === 12 ? `${ft + 1}′ 0″` : `${ft}′ ${inch}″`;
}

/* Optical measurements are millimetres the world over — a PD is never
   quoted in inches — so they ignore the unit toggle entirely. */
export function fmtMm(mm) {
  if (mm == null || mm === '') return '—';
  return `${round(Number(mm), 1)} mm`;
}

/** Dioptres carry their sign and always two decimals: -2.25, +1.50 */
export function fmtDiopter(n) {
  if (n == null || n === '') return null;
  const v = Number(n);
  if (!isFinite(v)) return null;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/** One eye, written the way an optician writes it: -2.25 -0.75 ×180 */
export function fmtRx(eye) {
  if (!eye) return null;
  const has = ['sph', 'cyl', 'axis', 'add'].some((k) => eye[k] != null && eye[k] !== '');
  if (!has) return null;

  let out = eye.sph == null || Number(eye.sph) === 0 ? 'plano' : fmtDiopter(eye.sph);
  const cyl = fmtDiopter(eye.cyl);
  if (cyl != null) out += ` ${cyl}`;
  if (eye.axis != null && eye.axis !== '') out += ` ×${String(Math.round(eye.axis)).padStart(3, '0')}`;
  const add = fmtDiopter(eye.add);
  if (add != null && Number(eye.add) !== 0) out += `  ADD ${add}`;
  return out;
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Recent changes read better in plain words; older ones want the date. */
export function fmtWhen(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return fmtDate(iso);
}

/** Date and time, for the ledger where ordering within a day matters. */
export function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${fmtDate(iso)} · ${time}`;
}

export function ageFrom(birthday) {
  if (!birthday) return null;
  const b = new Date(`${birthday}T12:00:00`);
  if (isNaN(b)) return null;
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  if (years < 0) return null;
  if (years < 2) {
    const months = Math.max(0, years * 12 + (now.getMonth() - b.getMonth()));
    return `${months} mo`;
  }
  return `${years} yr`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
