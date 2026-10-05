import { defineConfig } from 'vite';

// The field check as one self-contained Node script (docs/CI-FIELD-CHECK.md). Built next to
// the app (dist/cli/) so projects can fetch it from the Pages site.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'src/cli/main.ts',
    outDir: process.env.CLI_OUT ?? 'dist/cli',
    emptyOutDir: false,
    target: 'node22',
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'field-check.mjs', format: 'es', banner: '#!/usr/bin/env node' } },
  },
  ssr: { noExternal: true },
});
