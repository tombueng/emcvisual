import { readFileSync } from 'node:fs';
import { expect, test as base } from '@playwright/test';

/** A 2 x 1.5 mm box (STEP), stands in for every model of KiCad's library. */
export const BOX_STEP = readFileSync('e2e/fixtures/models/Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm.step');

/**
 * The tests run without the network: requests to KiCad's 3D library on GitLab get the box,
 * and the requested paths are collected in `kicadModels`.
 */
export const test = base.extend<{ kicadModels: string[] }>({
  kicadModels: [
    async ({ page }, use) => {
      const seen: string[] = [];
      await page.route('https://gitlab.com/api/v4/projects/**', (route) => {
        seen.push(decodeURIComponent(/files\/([^/]+)\/raw/.exec(route.request().url())?.[1] ?? ''));
        return route.fulfill({ body: BOX_STEP, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' } });
      });
      await use(seen);
    },
    { auto: true },
  ],
});

export { expect };
