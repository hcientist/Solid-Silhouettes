/* Syncing and sharing decisions, run against the app's own modules.

   bun --preload ./test/svelte-modules.mjs test/sync.test.mjs

   Each check names the bug it would have caught. Where the behaviour rests on
   a Solid specification, the requirement is cited:

   - Web Access Control 1.0.0 (https://solidproject.org/TR/2024/wac-20240512)
   - Solid Protocol 0.11.0 (https://solidproject.org/TR/2024/protocol-20240512)
   - Linked Data Platform 1.0 (https://www.w3.org/TR/ldp/) */
import { doc, replaceDoc, savePerson, watchDoc } from '../src/lib/store.svelte.js';
import {
  syncDecision, planPush, stillReads, legacyShareDirIn, normaliseLocation
} from '../src/lib/solid.svelte.js';
import { flushSync } from 'svelte';

let fails = 0;
const eq = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
};
const settle = () => new Promise((r) => setTimeout(r, 0)).then(() => flushSync());

/* ------------------------------------------------ a pulled copy is not an edit

   Bug: taking in the pod's copy re-stamped it as a fresh local edit and sent
   it back, so two people sharing a wardrobe each saw "Two copies" on every
   load. App behaviour; no Solid requirement involved. */
{
  let changes = 0;
  watchDoc(() => changes++);
  await settle();

  const stamp = '2026-01-02T03:04:05.000Z';
  replaceDoc({ units: 'metric', updatedAt: stamp, people: [{ id: 'p1', name: 'Ada' }] });
  await settle();
  eq('pulled copy keeps its own timestamp', stamp, doc.updatedAt);
  eq('pulled copy is not sent back to the pod', 0, changes);
  eq('pulled copy is kept on this device', 'Ada', JSON.parse(localStorage.getItem('solidsilhouettes.doc.v1')).people[0].name);

  savePerson('p1', { name: 'Ada L.' });
  await settle();
  eq('a real edit is stamped now', true, doc.updatedAt > stamp);
  eq('a real edit is sent to the pod', 1, changes);
  watchDoc(null);
}

/* ------------------------------------------------ which copy wins on connect */
{
  const at = (iso) => Date.parse(iso);
  const T1 = '2026-01-01T00:00:00.000Z';
  const T2 = '2026-01-02T00:00:00.000Z';
  const T3 = '2026-01-03T00:00:00.000Z';
  const has = [{ id: 'p' }];
  const decide = (remote, local, mark, indexWritable = true) => syncDecision({ remote, local, mark, indexWritable });

  // Bug: with both sides holding people, any newer pod copy prompted, even when
  // this device had changed nothing since it last synced.
  eq('only the pod changed since the last sync: take it quietly', 'apply',
    decide({ people: has, updatedAt: T3 }, { people: has, updatedAt: T2 }, at(T2)));
  eq('only this device changed: send it', 'push',
    decide({ people: has, updatedAt: T2 }, { people: has, updatedAt: T3 }, at(T2)));
  eq('both changed: ask', 'ask',
    decide({ people: has, updatedAt: T3 }, { people: has, updatedAt: T3 }, at(T1)));
  eq('neither changed: nothing to send', 'remember',
    decide({ people: has, updatedAt: T2 }, { people: has, updatedAt: T2 }, at(T2)));
  eq('no record of a last sync, pod newer: ask (as before)', 'ask',
    decide({ people: has, updatedAt: T3 }, { people: has, updatedAt: T2 }, null));
  eq('no record of a last sync, device newer: send (as before)', 'push',
    decide({ people: has, updatedAt: T2 }, { people: has, updatedAt: T3 }, null));

  // Bug: a person-only recipient could push their whole local wardrobe over
  // the owner's. They can read the index but not write it (WAC §5.3.1
  // #server-update-operation), so they always take the pod's copy.
  eq('read-only list: always take the pod copy, even with newer local edits', 'apply',
    decide({ people: has, updatedAt: T1 }, { people: has, updatedAt: T3 }, at(T1), false));
  eq('read-only list with no readable people: still never push', 'apply',
    decide({ people: [], updatedAt: T1 }, { people: has, updatedAt: T3 }, null, false));

  // Bug: with a shared wardrobe open last time, this device's copy holds the
  // other person's people. Starting on our own wardrobe compared the two as
  // if they were versions of one, and the newer local copy was pushed into
  // our own pod.
  const other = (remote, local) => syncDecision({ remote, local, mark: null, indexWritable: true, elsewhere: true });
  eq('device copy is another wardrobe, local newer: take the pod copy', 'apply',
    other({ people: has, updatedAt: T1 }, { people: has, updatedAt: T3 }));
  eq('device copy is another wardrobe, this one empty: still never push', 'apply',
    other({ people: [], updatedAt: T1 }, { people: has, updatedAt: T3 }));
}

/* ------------------------------------------------ what a push may touch */
{
  const a = { id: 'a', name: 'A' };
  const b = { id: 'b', name: 'B' };
  const pushed = new Map([['a', JSON.stringify(a)], ['gone', '{}']]);
  const edited = { ...a, name: 'A2' };

  const owner = planPush([edited, b], pushed, true);
  eq('owner: writes changed and new people', ['a', 'b'], owner.write.map((p) => p.id));
  eq('owner: deletes removed people', ['gone'], owner.remove);
  eq('owner: nothing out of reach', 0, owner.outOfReach);

  // Bug: a person-only recipient's push created and deleted documents in the
  // owner's folder. Creating needs Append on the container and deleting needs
  // Write (WAC §5.3.1 #http-post, #http-delete); a person share grants neither.
  const shared = planPush([edited, b], pushed, false);
  eq('shared person: edits to people given are written', ['a'], shared.write.map((p) => p.id));
  eq('shared person: nobody is deleted', [], shared.remove);
  eq('shared person: the add and the removal are reported instead', 2, shared.outOfReach);
  eq('nothing changed: nothing written', [], planPush([a], new Map([['a', JSON.stringify(a)]]), true).write);
}

/* ------------------------------------------------ taking back index access

   A person share also grants read on the index, because the index's ACL is
   its own and does not inherit from the person's document (WAC §5.1
   #effective-acl-resource-algorithm). Stopping the last person share takes it
   back, but only on clear evidence. */
{
  eq('no reads left anywhere: revoke', false, stillReads([{ read: false }, { read: false, write: false }]));
  eq('another person still shared: keep', true, stillReads([{ read: false }, { read: true }]));
  // Bug (found live): checking all people at once swamped the server, failed
  // checks counted as "no access", and the index read was taken away.
  eq('a check that failed: keep', true, stillReads([{ read: false }, null]));
}

/* ------------------------------------------------ the old shared/ folder

   A container lists what it contains (LDP 1.0 §5.2 ldp:contains; Solid
   Protocol §4.2 #server-hierarchical-containment), so the legacy folder is
   only fetched when the listing names it. Bug: it was fetched on every load,
   logging a 404 (403 for a recipient) for everyone without one. */
{
  const base = 'https://pod.example/clothes/';
  eq('no shared/ in the listing: not fetched', [], legacyShareDirIn([`${base}wardrobe.ttl`, `${base}a.ttl`], base));
  eq('shared/ in the listing: fetched', [`${base}shared/`], legacyShareDirIn([`${base}wardrobe.ttl`, `${base}shared/`], base));
}

/* ------------------------------------------------ opening a shared person

   The share dialog used to show a person's own document. Pasting it made the
   app treat that document as the wardrobe index. */
{
  const base = 'https://pod.example/clothes/';
  const id = '0ce152d9-51d1-48b3-b703-553ab811692a';
  eq('a person document opens its wardrobe', `${base}wardrobe.ttl`, normaliseLocation(`${base}${id}.ttl`));
  eq('a folder opens its wardrobe', `${base}wardrobe.ttl`, normaliseLocation(base));
  eq('a folder without the slash too', `${base}wardrobe.ttl`, normaliseLocation(base.slice(0, -1)));
  eq('an index document named outright is kept', `${base}other.ttl`, normaliseLocation(`${base}other.ttl`));
}

console.log(fails ? `\n${fails} FAILED` : '\nall sync checks passed');
process.exit(fails ? 1 : 0);
