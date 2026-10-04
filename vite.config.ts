import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { seoPlugin } from './tools/vite/seo';

// On GitHub Pages the site lives under /<repo>/; derive it from the CI environment so a repo
// rename needs no code change.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.PAGES_BASE ?? (repoName ? `/${repoName}/` : '/');

export default defineConfig({
  base,
  // seoPlugin also fills the name into index.html, so the codename lives only in branding.config.json
  plugins: [svelte(), seoPlugin()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
