#!/usr/bin/env node
// Renames the project in every place the codename is allowed to live.
// Usage: node scripts/rename.mjs --codename newname --display "New Name" [--tagline "..."] [--dry-run]
// Manual steps (GitHub, local folder, Pages) are printed at the end; see docs/RENAMING.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    codename: { type: 'string' },
    display: { type: 'string' },
    tagline: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!values.codename || !/^[a-z0-9][a-z0-9-]*$/.test(values.codename)) {
  console.error('--codename is required (lowercase letters, digits, dashes)');
  process.exit(2);
}

const dry = values['dry-run'];
const write = (path, text) => (dry ? console.log(`[dry-run] would write ${path}`) : writeFileSync(path, text));

const brandingPath = 'branding.config.json';
const branding = JSON.parse(readFileSync(brandingPath, 'utf8'));
const old = branding.codename;
if (old === values.codename) {
  console.error('new codename equals the current one');
  process.exit(2);
}
const [owner] = branding.repo.split('/');
const updated = {
  ...branding,
  codename: values.codename,
  displayName: values.display ?? values.codename,
  tagline: values.tagline ?? branding.tagline,
  repo: `${owner}/${values.codename}`,
  // GitHub Pages URL (no redirect after a rename: see docs/RENAMING.md before switching)
  siteUrl: branding.siteUrl?.includes('.github.io/') ? `https://${owner}.github.io/${values.codename}/` : branding.siteUrl,
  previousCodenames: [...new Set([...(branding.previousCodenames ?? []), old])],
};
write(brandingPath, JSON.stringify(updated, null, 2) + '\n');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.name = values.codename;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

const readme = readFileSync('README.md', 'utf8');
write('README.md', readme.replaceAll(branding.displayName, updated.displayName).replaceAll(old, values.codename));

console.log(`
Renamed ${old} -> ${values.codename} in branding.config.json, package.json, README.md.

Next steps (docs/RENAMING.md):
  npm install                      # refresh package-lock.json
  npm run check:codename && npm run check && npm test && npm run build
  gh repo rename ${values.codename}
  git remote set-url origin https://github.com/${owner}/${values.codename}.git
  mv ~/${old} ~/${values.codename}   # local folder
  GitHub Pages does NOT redirect: set up a custom domain or a redirect page first.
`);
