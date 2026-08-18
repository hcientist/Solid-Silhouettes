/* Where does a wardrobe live in a pod? The Solid answer is not "wherever
   the app decided": the profile points at a type index, and the index says
   which document holds data of a given class. An app looks there first and
   registers what it creates, so the person's own pod stays the authority on
   its layout rather than every app inventing a folder. */

const SOLID = 'http://www.w3.org/ns/solid/terms#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export const P = {
  privateIndex: SOLID + 'privateTypeIndex',
  publicIndex: SOLID + 'publicTypeIndex',
  forClass: SOLID + 'forClass',
  instance: SOLID + 'instance',
  instanceContainer: SOLID + 'instanceContainer'
};

const T = {
  TypeIndex: SOLID + 'TypeIndex',
  UnlistedDocument: SOLID + 'UnlistedDocument',
  TypeRegistration: SOLID + 'TypeRegistration'
};

/** The index documents this WebID declares, private first. */
export async function indexUrls(client, webId, fetch) {
  try {
    const profile = await client.getSolidDataset(webId, { fetch });
    const me = client.getThing(profile, webId);
    if (!me) return [];
    return [
      ...client.getUrlAll(me, P.privateIndex).map((url) => ({ url, private: true })),
      ...client.getUrlAll(me, P.publicIndex).map((url) => ({ url, private: false }))
    ];
  } catch {
    return []; // a profile that does not say is the same as one that has none
  }
}

/** The registered instance for a class, or null if nothing is registered. */
export async function findRegistration(client, webId, forClass, fetch) {
  for (const index of await indexUrls(client, webId, fetch)) {
    try {
      const ds = await client.getSolidDataset(index.url, { fetch });
      for (const t of client.getThingAll(ds)) {
        if (!client.getUrlAll(t, P.forClass).includes(forClass)) continue;
        const instance = client.getUrlAll(t, P.instance)[0];
        const container = client.getUrlAll(t, P.instanceContainer)[0];
        if (instance || container) return { instance, container, index: index.url };
      }
    } catch {
      /* an index we cannot read tells us nothing; try the next */
    }
  }
  return null;
}

/* Some servers hand out a profile with no type index at all — a fresh
   Community Solid Server pod declares only its OIDC issuer. Making one is
   the difference between the type index being a nice idea and it actually
   working, so create it and link it from the profile. Additive only: one
   new document, one new triple. */
async function createIndex(client, webId, podUrl, fetch) {
  const url = `${podUrl.replace(/\/?$/, '/')}settings/privateTypeIndex.ttl`;

  let index = client.createSolidDataset();
  index = client.setThing(
    index,
    client
      .buildThing(client.createThing({ url }))
      .addUrl(RDF_TYPE, T.TypeIndex)
      .addUrl(RDF_TYPE, T.UnlistedDocument)
      .build()
  );
  await client.saveSolidDatasetAt(url, index, { fetch });

  const profile = await client.getSolidDataset(webId, { fetch });
  const me = client.getThing(profile, webId);
  if (!me) throw new Error('That profile has no subject to add to.');
  const updated = client.buildThing(me).addUrl(P.privateIndex, url).build();
  await client.saveSolidDatasetAt(webId, client.setThing(profile, updated), { fetch });

  return { url, private: true };
}

/** Record where this app put its data, so any Solid app can find it later.
    Best effort: a pod that refuses the write still works, it just will not
    advertise the location. */
export async function register(client, webId, forClass, instanceUrl, fetch, podUrl = null) {
  const indexes = await indexUrls(client, webId, fetch);
  let target = indexes.find((i) => i.private) ?? indexes[0];

  if (!target && podUrl) {
    try {
      target = await createIndex(client, webId, podUrl, fetch);
    } catch (err) {
      return { ok: false, reason: 'no-index', error: err };
    }
  }
  if (!target) return { ok: false, reason: 'no-index' };

  try {
    const ds = await client.getSolidDataset(target.url, { fetch });

    const existing = client
      .getThingAll(ds)
      .find((t) => client.getUrlAll(t, P.forClass).includes(forClass));

    const thing = client
      .buildThing(existing ?? client.createThing({ name: 'solidsilhouettes' }))
      .setUrl(RDF_TYPE, T.TypeRegistration)
      .setUrl(P.forClass, forClass)
      .setUrl(P.instance, instanceUrl)
      .build();

    await client.saveSolidDatasetAt(target.url, client.setThing(ds, thing), { fetch });
    return { ok: true, index: target.url, private: target.private, created: !indexes.length };
  } catch (err) {
    return { ok: false, reason: 'refused', error: err };
  }
}

export { T as TYPES };
