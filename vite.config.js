import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: process.env.GITHUB_ACTIONS ? '/Solid-Silhouettes/' : '/',
  server: { port: 5273 },
  // The Solid client libraries still reach for a couple of Node globals.
  define: { global: 'globalThis' }
});
