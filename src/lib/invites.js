/* Telling someone a wardrobe was shared with them.

   Granting access in Solid is silent: the recipient's pod hears nothing, so
   until now they had to be sent an address and paste it in. Instead the
   sharer drops a notice in the recipient's inbox, the container their
   profile advertises with ldp:inbox (Solid Protocol 0.11.0 does not define
   one, but Linked Data Notifications does: https://www.w3.org/TR/ldn/#discovery).
   Anyone may post there, so a notice is only a claim. The recipient's app
   shows it as pending, and only when the claim checks out: the wardrobe
   opens for them and is not simply public. Nothing is added to their list
   until they accept, and a notice nobody answers is deleted after a week.

   The notice is an Activity Streams 2.0 Offer, typed with this app's own
   class too so other inbox readers can tell what it is and this app can
   tell its own notices from everyone else's. */

import { SS } from './rdf.js';

const AS = 'https://www.w3.org/ns/activitystreams#';
const LDP_INBOX = 'http://www.w3.org/ns/ldp#inbox';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_DATETIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn';
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';
const DCT = 'http://purl.org/dc/terms/';
const PIM_PREFS = 'http://www.w3.org/ns/pim/space#preferencesFile';

export const T = {
  WardrobeShare: SS + 'WardrobeShare',
  SharedWardrobe: SS + 'SharedWardrobe',
  Offer: AS + 'Offer'
};

const P = {
  actor: AS + 'actor',
  object: AS + 'object',
  target: AS + 'target',
  summary: AS + 'summary',
  published: AS + 'published',
  wardrobe: SS + 'wardrobe',
  creator: DCT + 'creator',
  created: DCT + 'created',
  fn: VCARD_FN
};

export const DAY = 24 * 60 * 60 * 1000;
/** How long a notice waits for an answer. */
export const WEEK = 7 * DAY;

/** An absolute http(s) IRI that can go between <> in Turtle as it is. */
const iriOk = (s) => typeof s === 'string' && /^https?:\/\/[^\s<>"{}|\\^`]+$/i.test(s);
const literal = (s) =>
  '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';

/** The Turtle a sharer posts. The notice is the document itself (<>). */
export function noticeTurtle({ actor, object, target, summary, published }) {
  for (const iri of [actor, object, target]) {
    if (!iriOk(iri)) throw new Error(`Not an address that can go in a notice: ${iri}`);
  }
  const at = new Date(published).toISOString();
  return `@prefix as: <${AS}> .
@prefix ss: <${SS}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a as:Offer, ss:WardrobeShare ;
  as:actor <${actor}> ;
  as:object <${object}> ;
  as:target <${target}> ;
  as:summary ${literal(summary ?? '')} ;
  as:published ${literal(at)}^^xsd:dateTime .
`;
}

/** This app's notice in a fetched inbox item, or null for anything else. */
export function readNotice(client, ds, url) {
  const thing = client.getThingAll(ds).find((t) => client.getUrlAll(t, RDF_TYPE).includes(T.WardrobeShare));
  if (!thing) return null;
  const object = client.getUrl(thing, P.object);
  const actor = client.getUrl(thing, P.actor);
  if (!iriOk(object) || !iriOk(actor)) return null;
  const published = client.getDatetime(thing, P.published);
  return {
    url,
    actor,
    object,
    target: client.getUrl(thing, P.target),
    summary: client.getStringNoLocale(thing, P.summary) ?? '',
    published: published ? published.getTime() : null
  };
}

/** What to do with one of our notices:
    keep       show it as pending
    expired    older than a week (or dated in the future): delete it
    duplicate  already accepted, or an older notice for the same wardrobe: delete it
    unshared   the wardrobe does not open for us, or anyone can open it: delete it
    later      could not tell right now: leave it, show nothing

    access is solid-client's effective access on the wardrobe ({ user, public }),
    'denied' when the pod refused or it is gone, or null when the check failed. */
export function triage(notice, { now, accepted = [], newest = null, access }) {
  const stale = staleness(notice, { now, accepted, newest });
  if (stale) return stale;
  if (access === 'denied') return 'unshared';
  if (!access) return 'later';
  // A public wardrobe was not shared with anyone in particular: an offer of
  // it is how a stranger would get onto the table.
  if (!access.user?.read || access.public?.read) return 'unshared';
  return 'keep';
}

/** The verdicts that need no request to the wardrobe: expired or
    duplicate, or null when its access has to be checked. */
export function staleness(notice, { now, accepted = [], newest = null }) {
  if (!notice.published || now - notice.published > WEEK || notice.published - now > DAY) return 'expired';
  if (accepted.includes(notice.object)) return 'duplicate';
  if (newest && newest !== notice.url) return 'duplicate';
  return null;
}

/** The newest notice for each wardrobe, so repeats collapse to one. */
export function newestPerWardrobe(notices) {
  const best = new Map();
  for (const n of notices) {
    const cur = best.get(n.object);
    if (!cur || (n.published ?? 0) > (cur.published ?? 0)) best.set(n.object, n);
  }
  return new Map([...best].map(([object, n]) => [object, n.url]));
}

/** The inbox a WebID's profile advertises, or null. */
export async function inboxOf(client, webId, fetch) {
  const profile = await client.getSolidDataset(webId, { fetch });
  const me = client.getThing(profile, webId);
  return (me && client.getUrl(me, LDP_INBOX)) || null;
}

/** A display name from a profile, or null. Never fatal. */
export async function nameOf(client, webId, fetch) {
  try {
    const profile = await client.getSolidDataset(webId, { fetch });
    const me = client.getThing(profile, webId);
    return (me && (client.getStringNoLocale(me, VCARD_FN) || client.getStringNoLocale(me, FOAF_NAME))) || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------- the "shared with me" list

   Kept in the recipient's own pod so it follows them between devices, in a
   document only they can read: their preferences file (pim:preferencesFile),
   or else their private type index. Never in the wardrobe folder, which they
   may have shared with others. */

export async function listDocUrl(client, webId, fetch, privateIndexUrl = null) {
  try {
    const profile = await client.getSolidDataset(webId, { fetch });
    const me = client.getThing(profile, webId);
    const prefs = me && client.getUrl(me, PIM_PREFS);
    if (prefs) {
      const res = await fetch(prefs, { method: 'HEAD' });
      if (res.ok) return prefs;
    }
  } catch {
    /* fall through to the type index */
  }
  return privateIndexUrl;
}

/** Same wardrobe, same name, every time, so accepting twice is one entry. */
export function entryName(index) {
  let h = 5381;
  for (let i = 0; i < index.length; i++) h = ((h << 5) + h + index.charCodeAt(i)) >>> 0;
  return `ss-shared-${h.toString(16)}`;
}

export function readList(client, ds) {
  return client
    .getThingAll(ds)
    .filter((t) => client.getUrlAll(t, RDF_TYPE).includes(T.SharedWardrobe))
    .map((t) => ({
      index: client.getUrl(t, P.wardrobe),
      owner: client.getUrl(t, P.creator),
      ownerName: client.getStringNoLocale(t, P.fn) ?? null
    }))
    .filter((e) => iriOk(e.index));
}

export function addToList(client, ds, { index, owner, ownerName }, docUrl) {
  let b = client
    .buildThing(client.createThing({ url: `${docUrl}#${entryName(index)}` }))
    .addUrl(RDF_TYPE, T.SharedWardrobe)
    .addUrl(P.wardrobe, index)
    .addDatetime(P.created, new Date());
  if (iriOk(owner)) b = b.addUrl(P.creator, owner);
  if (ownerName) b = b.addStringNoLocale(P.fn, ownerName);
  return client.setThing(ds, b.build());
}

export function removeFromList(client, ds, index, docUrl) {
  return client.removeThing(ds, `${docUrl}#${entryName(index)}`);
}
