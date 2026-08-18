/* Decided once, before anything else runs, because the store persists on
   import: a session opened through a shared link must not read or write the
   visitor's own wardrobe at all. Normalising and saving it back would be
   silent enough to look harmless, but it moves the local copy's timestamp
   forward and could then win a conflict against their real pod copy. */
export const SHARED_VIEW = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('view');
  } catch {
    return false;
  }
})();
