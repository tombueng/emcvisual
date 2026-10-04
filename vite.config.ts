import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import branding from './branding.config.json' with { type: 'json' };

// Put the display name into index.html so the codename lives only in branding.config.json.
function brandingHtml(): Plugin {
  return {
    name: 'branding-html',
    transformIndexHtml: (html) =>
      html.replaceAll('%APP_NAME%', branding.displayName).replaceAll('%APP_TAGLINE%', branding.tagline),
  };
}

// On GitHub Pages the site lives under /<repo>/; derive it from the CI environment so a repo
// rename needs no code change.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.PAGES_BASE ?? (repoName ? `/${repoName}/` : '/');

export default defineConfig({
  base,
  plugins: [svelte(), brandingHtml()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
