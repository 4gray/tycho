import { defineConfig } from 'vite';

// better-sqlite3 is a native module: keep it out of the bundle and load it from node_modules.
export default defineConfig({
  build: { rollupOptions: { external: ['better-sqlite3'] } },
});
