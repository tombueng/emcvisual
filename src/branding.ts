import config from '../branding.config.json';

/** Single source of truth for the product name. Never hard-code the name elsewhere. */
export const branding = {
  codename: config.codename,
  displayName: config.displayName,
  tagline: config.tagline,
  repo: config.repo,
  /** Stable prefix for browser storage keys; must not change on a rename. */
  storageNamespace: config.storageNamespace,
} as const;
