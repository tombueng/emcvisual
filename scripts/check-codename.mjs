#!/usr/bin/env node
// Fails when the codename (or a previous one) appears outside the allowed files.
// See docs/RENAMING.md for why the name must live in one place.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const branding = JSON.parse(readFileSync(new URL('../branding.config.json', import.meta.url), 'utf8'));
const ALLOWED = new Set(['branding.config.json', 'package.json', 'package-lock.json', 'README.md', 'docs/RENAMING.md']);
const BINARY = /\.(png|jpe?g|gif|webp|ico|glb|step|wrl|woff2?|pdf|zip)$/i;

const names = [branding.codename, ...(branding.previousCodenames ?? [])].filter(Boolean);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !BINARY.test(f));

let hits = 0;
for (const file of files) {
  if (ALLOWED.has(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const name of names) {
      if (line.toLowerCase().includes(name.toLowerCase())) {
        console.error(`${file}:${i + 1}: contains "${name}"`);
        hits++;
      }
    }
  });
}

if (hits > 0) {
  console.error(`\n${hits} occurrence(s) of the codename outside the allowed files. Use src/branding.ts instead.`);
  process.exit(1);
}
console.log(`codename check ok (${files.length} files, names: ${names.join(', ')})`);
