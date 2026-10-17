/* Share notices: what a sharer posts, and what the recipient's app makes of it.

   bun test/invites.test.mjs

   - Linked Data Notifications (https://www.w3.org/TR/ldn/): a receiver's inbox
     is found from the resource's ldp:inbox (§2.1 #discovery), and a sender
     POSTs an RDF notification to it (§2.2 #sender).
   - Activity Streams 2.0 Vocabulary (https://www.w3.org/TR/activitystreams-vocabulary/):
     the notice is an as:Offer with as:actor, as:object, as:target, as:published.
   - Web Access Control 1.0.0 (https://solidproject.org/TR/2024/wac-20240512):
     whether the wardrobe is really shared is what the pod answers when asked
     for it (§5.1 #effective-acl-resource-algorithm), not what the notice says. */
import * as client from '@inrupt/solid-client';
import {
  noticeTurtle, readNotice, triage, staleness, newestPerWardrobe,
  readList, addToList, removeFromList, entryName, inboxOf, WEEK, DAY
} from '../src/lib/invites.js';

let fails = 0;
const eq = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
};
const throws = (name, fn) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  eq(name, true, threw);
};

/** Parse Turtle the way the app will meet it: fetched from a pod. */
const turtle = (url, body) => {
  const res = new Response(body, { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  Object.defineProperty(res, 'url', { value: url }); // relative IRIs resolve against it
  return res;
};
const parse = (url, body) => client.getSolidDataset(url, { fetch: async () => turtle(url, body) });

const ALICE = 'https://pod.example/alice/profile/card#me';
const BOB = 'https://pod.example/bob/profile/card#me';
const WARDROBE = 'https://pod.example/alice/clothes/wardrobe.ttl';
const NOW = Date.parse('2026-10-17T12:00:00Z');
const INBOX_ITEM = 'https://pod.example/bob/inbox/solidsilhouettes-share';

/* ------------------------------------------------ the notice itself */
{
  const ttl = noticeTurtle({
    actor: ALICE, object: WARDROBE, target: BOB, published: NOW,
    summary: 'Alice "A\\B"\nshared their wardrobe'
  });
  const n = readNotice(client, await parse(INBOX_ITEM, ttl), INBOX_ITEM);
  eq('round trip: who shared', ALICE, n?.actor);
  eq('round trip: which wardrobe', WARDROBE, n?.object);
  eq('round trip: shared with whom', BOB, n?.target);
  eq('round trip: when', NOW, n?.published);
  eq('a summary with quotes, backslashes and newlines survives', 'Alice "A\\B"\nshared their wardrobe', n?.summary);

  // Bug this guards: an address with ">" or a space would end the IRI early
  // and let a crafted WebID add triples of its own to the notice.
  throws('an address that would break out of <> is refused', () =>
    noticeTurtle({ actor: ALICE, object: 'https://x.example/a> <#b> <#c', target: BOB, published: NOW }));
  throws('a relative address is refused', () =>
    noticeTurtle({ actor: ALICE, object: 'wardrobe.ttl', target: BOB, published: NOW }));
}

/* ------------------------------------------------ other apps' notifications are not ours */
{
  const other = '@prefix as: <https://www.w3.org/ns/activitystreams#> . <> a as:Offer ; as:actor <https://x.example/me> ; as:object <https://x.example/doc> .';
  eq('an Offer from another app is left alone', null, readNotice(client, await parse(INBOX_ITEM, other), INBOX_ITEM));
  const relative = `@prefix ss: <https://solidsilhouettes.app/ns#> . @prefix as: <https://www.w3.org/ns/activitystreams#> .
    <> a ss:WardrobeShare ; as:actor <${ALICE}> ; as:object <javascript:alert(1)> .`;
  eq('a notice pointing at something that is not a web address is ignored', null,
    readNotice(client, await parse(INBOX_ITEM, relative), INBOX_ITEM));
}

/* ------------------------------------------------ what gets shown */
{
  const n = { url: INBOX_ITEM, actor: ALICE, object: WARDROBE, published: NOW - DAY };
  const shared = { user: { read: true }, public: { read: false } };

  eq('shared with me, recent, new: show it', 'keep', triage(n, { now: NOW, access: shared }));
  eq('older than a week: delete', 'expired', triage({ ...n, published: NOW - WEEK - 1 }, { now: NOW, access: shared }));
  eq('dated in the future, to linger: delete', 'expired', triage({ ...n, published: NOW + 2 * DAY }, { now: NOW, access: shared }));
  eq('no date: delete', 'expired', triage({ ...n, published: null }, { now: NOW, access: shared }));
  eq('already on my list: delete', 'duplicate', triage(n, { now: NOW, accepted: [WARDROBE], access: shared }));
  eq('an older notice for the same wardrobe: delete', 'duplicate', triage(n, { now: NOW, newest: INBOX_ITEM + '-2', access: shared }));

  // The spam guard. Anyone may post to an inbox (LDN §2.2); only the pod
  // can say whether the wardrobe is really open to me (WAC §5.1).
  eq('the pod refuses me: delete', 'unshared', triage(n, { now: NOW, access: 'denied' }));
  eq('anyone can open it, so nobody shared it with me: delete', 'unshared',
    triage(n, { now: NOW, access: { user: { read: true }, public: { read: true } } }));
  eq('the check failed: leave it, show nothing', 'later', triage(n, { now: NOW, access: null }));

  eq('staleness needs no access check for a fresh notice', null, staleness(n, { now: NOW }));
}

/* ------------------------------------------------ repeats collapse */
{
  const a = { url: 'i/1', object: WARDROBE, published: 1 };
  const b = { url: 'i/2', object: WARDROBE, published: 3 };
  const c = { url: 'i/3', object: 'https://pod.example/carol/w.ttl', published: 2 };
  const newest = newestPerWardrobe([a, b, c]);
  eq('newest notice per wardrobe wins', ['i/2', 'i/3'], [newest.get(WARDROBE), newest.get(c.object)]);
}

/* ------------------------------------------------ the accepted list */
{
  const LIST = 'https://pod.example/bob/settings/preferences.ttl';
  let ds = await parse(LIST, `<${BOB}> <http://xmlns.com/foaf/0.1/name> "Bob" .`);
  ds = addToList(client, ds, { index: WARDROBE, owner: ALICE, ownerName: 'Alice' }, LIST);
  ds = addToList(client, ds, { index: WARDROBE, owner: ALICE, ownerName: 'Alice' }, LIST);
  eq('accepting twice is one entry', [{ index: WARDROBE, owner: ALICE, ownerName: 'Alice' }], readList(client, ds));
  eq('the rest of the preferences file is untouched', 'Bob',
    client.getStringNoLocale(client.getThing(ds, BOB), 'http://xmlns.com/foaf/0.1/name'));
  ds = removeFromList(client, ds, WARDROBE, LIST);
  eq('removing takes it off', [], readList(client, ds));
  eq('entry names are stable', entryName(WARDROBE), entryName(WARDROBE));
}

/* ------------------------------------------------ finding the inbox (LDN §2.1) */
{
  const profile = `<${BOB}> <http://www.w3.org/ns/ldp#inbox> <https://pod.example/bob/inbox/> .`;
  const fetch = async () => turtle(BOB.split('#')[0], profile);
  eq('the inbox comes from ldp:inbox on the WebID', 'https://pod.example/bob/inbox/', await inboxOf(client, BOB, fetch));
  const none = async () => turtle(BOB.split('#')[0], `<${BOB}> a <http://xmlns.com/foaf/0.1/Person> .`);
  eq('no ldp:inbox: none', null, await inboxOf(client, BOB, none));
}

console.log(fails ? `\n${fails} FAILED` : '\nall invite checks passed');
process.exit(fails ? 1 : 0);
