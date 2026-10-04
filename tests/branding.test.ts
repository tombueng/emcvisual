import { describe, expect, it } from 'vitest';
import { branding } from '../src/branding';

describe('branding', () => {
  it('keeps storage keys independent of the codename', () => {
    // A rename must not orphan data users saved in their browser (docs/RENAMING.md).
    expect(branding.storageNamespace.toLowerCase()).not.toContain(branding.codename.toLowerCase());
  });

  it('has a display name and a repo slug', () => {
    expect(branding.displayName.length).toBeGreaterThan(0);
    expect(branding.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
  });
});
