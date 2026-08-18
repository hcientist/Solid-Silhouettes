/* Someone opening a shared link has no pod, no WebID and no data of their
   own — and may well be using this app for their own family in the same
   browser. So a shared view is rendered from its own state and never touches
   the stored wardrobe: no reading it, no writing it, no unit preference. */

import { SHARED_VIEW } from './mode.js';

export const viewer = $state({
  active: false,
  loading: false,
  error: null,
  source: null,
  sharedBy: null,
  units: 'metric',
  people: [],
  selectedId: null
});

/** The link is the capability, so the address itself is the whole parameter. */
export function sharedUrlFromLocation() {
  if (!SHARED_VIEW) return null;
  try {
    return new URLSearchParams(window.location.search).get('view');
  } catch {
    return null;
  }
}

export async function loadSharedView(url) {
  viewer.active = true;
  viewer.loading = true;
  viewer.error = null;
  viewer.source = url;

  try {
    // Deliberately unauthenticated: this has to work for someone with no pod.
    const [client, rdf] = await Promise.all([import('@inrupt/solid-client'), import('./rdf.js')]);
    const ds = await client.getSolidDataset(url);
    const parsed = rdf.readWardrobe(client, [ds]);
    if (!parsed || !parsed.people.length) {
      viewer.error = 'That link points at something this app cannot read.';
    } else {
      viewer.units = parsed.units;
      viewer.people = parsed.people;
      viewer.sharedBy = parsed.sharedBy;
      viewer.selectedId = parsed.people[0].id;
    }
  } catch (err) {
    console.warn(err);
    viewer.error =
      'That link did not open. It may have been withdrawn, or it was never made public.';
  } finally {
    viewer.loading = false;
  }
}

export const viewerSelected = () =>
  viewer.people.find((p) => p.id === viewer.selectedId) ?? null;
