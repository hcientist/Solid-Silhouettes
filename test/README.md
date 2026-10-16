# Tests

The browser tests need `puppeteer-core` and a Chrome on the machine; the pod
tests need a Solid server. Neither is a dependency of the app itself:

```
bun add -d puppeteer-core @solid/community-server
```

```
bun test/rdf.test.mjs        # no server needed
bun --preload ./test/svelte-modules.mjs test/sync.test.mjs   # no server needed
bun test/live-pod.test.mjs   # needs a server on :3111 (see below)
bun test/storage.test.mjs    # needs a server on :3111
```

`rdf.test.mjs` round-trips a wardrobe through the real `@inrupt/solid-client`
serializer against a fake pod, and checks that the older single-document layout
still reads.

The other two need a real Solid server, because the things they check — access
control, overwrite semantics, storage discovery — are exactly the things a mock
gets wrong. A mock pod ignoring `If-None-Match` is what hid the bug where every
write after the first returned 412.

```
bun add @solid/community-server
# CSS needs real Node; `node` here is a Bun shim
~/.nvm/versions/node/*/bin/node node_modules/@solid/community-server/bin/server.js \
  -p 3111 -b http://localhost:3111/ -c @css:config/default.json -l warn
```

The server keeps accounts for its lifetime, so each run mints its own.

`app-ui.browser.mjs` drives the app itself: adding people, every clickable
region, revision history, the ledger, units.

`view-link.test.mjs` and `viewer.browser.mjs` cover the public read-only link.
The first uses a plain unauthenticated `fetch` — what a stranger actually has —
to check both that the link opens and that nothing else does. The second opens a
published link in a real browser whose profile already holds its own wardrobe,
and checks that wardrobe is untouched afterwards; that assertion is what caught
the store normalising and re-saving on import in view mode.

`link-refresh.test.mjs` covers the lifecycle of a published copy: an edit
reaching it, unrelated links being left alone, a rename not orphaning it, and a
removed person taking their published copy with them.

`sync.test.mjs` runs the app's own runes modules (`*.svelte.js`), which
`svelte-modules.mjs` compiles on import the way the Vite plugin does. It covers
the decisions syncing and sharing make: that a copy pulled from the pod is not
an edit, which copy wins on connect, what a push may create or delete in a
wardrobe shared person by person, when index access is taken back, and how a
pasted address is read. Each check names the bug it would have caught and, where
the behaviour rests on one, the Web Access Control, Solid Protocol or LDP
requirement it follows.
