/* Lets bun import the app's runes modules (*.svelte.js) directly, compiled
   the way Vite's Svelte plugin compiles them, so tests exercise the real code.
   Use as: bun --preload ./test/svelte-modules.mjs test/sync.test.mjs */
import { plugin } from 'bun';
import { compileModule } from 'svelte/compiler';

const memory = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => void memory.set(k, String(v)),
  removeItem: (k) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i) => [...memory.keys()][i] ?? null,
  get length() { return memory.size; }
};
globalThis.window ??= { location: { origin: 'http://localhost', pathname: '/', search: '' } };

plugin({
  name: 'svelte-modules',
  setup(build) {
    build.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const { js } = compileModule(source, { filename: path, generate: 'client', dev: false });
      return { contents: js.code, loader: 'js' };
    });
  }
});
