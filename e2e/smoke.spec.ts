import { expect, test } from '@playwright/test';

test('demo board: load, compute, probe, diagnostics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ziehe eine KiCad-Platine hierher' })).toBeVisible();

  await page.getByRole('button', { name: 'Demo-Platine laden' }).click();
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.list li')).toHaveCount(6);

  // hover over the bad buck converter: the probe spectrum gets a peak line
  const canvas = page.locator('.canvas canvas');
  const box = (await canvas.boundingBox())!;
  const points: [number, number][] = [[0.3, 0.6], [0.32, 0.62], [0.35, 0.6]];
  for (const [fx, fy] of points) await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByText(/Höchste Linie/)).toBeVisible();

  // diagnostics list the built-in mistakes
  await page.getByRole('tab', { name: /Diagnose/ }).click();
  await expect(page.getByText(/Rückstrompfad unterbrochen/).first()).toBeVisible();
  await expect(page.getByText(/Bezugswechsel am Via/).first()).toBeVisible();

  // far field view with limit lines
  await page.getByRole('tab', { name: 'Fernfeld 3 m' }).click();
  await expect(page.getByText('CISPR 32 Klasse B')).toBeVisible();

  await page.screenshot({ path: 'e2e/output/demo.png' });
  expect(errors).toEqual([]);
});

test('editing sources: remove one, change a rise time, show field lines', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo-Platine laden' }).click();
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });

  await page.locator('.list li').filter({ hasText: 'LED 1 kHz' }).getByRole('button', { name: 'Quelle entfernen' }).click();
  await expect(page.locator('.list li')).toHaveCount(5);

  // select the bad clock and make its edges slower: the list summary follows
  await page.locator('.list li').filter({ hasText: 'Takt schlecht' }).locator('.pick').click();
  const tr = page.locator('#src-tr');
  await tr.fill('5 ns');
  await tr.press('Enter');
  await expect(page.locator('.list li').filter({ hasText: 'Takt schlecht' })).toContainText('5 ns');

  await page.getByText('Feldlinien der gewählten Quelle').click();
  await expect(page.getByText('Feldlinien werden berechnet …')).toBeHidden({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('switching to English keeps the board and the results', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo-Platine laden' }).click();
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('Sprache').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.locator('.list li')).toHaveCount(6);
  await expect(page.getByText(/computed in \d+\.\d s/)).toBeVisible();
  await page.getByRole('tab', { name: /Diagnostics/ }).click();
  await expect(page.getByText(/Return path broken/).first()).toBeVisible();

  // the choice sticks across a reload; the demo then comes with English source names
  await page.reload();
  await page.getByRole('button', { name: 'Load demo board' }).click();
  await expect(page.locator('.list li').first()).toContainText('Buck, tight loop');
  expect(errors).toEqual([]);
});

test.describe('without JavaScript (crawlers)', () => {
  test.use({ javaScriptEnabled: false });

  test('the page still explains the tool', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('see and hear the EMI of your PCB');
    await expect(page.getByText(/KiCad 6 to 10 boards/)).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /KiCad PCB/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });
});
