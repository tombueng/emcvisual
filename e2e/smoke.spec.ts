import { expect, test } from '@playwright/test';

test('demo board: load, compute, probe, diagnostics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ziehe eine KiCad-Platine hierher' })).toBeVisible();
  // public example boards are offered on the start page (loaded from GitHub when chosen)
  await expect(page.getByRole('button', { name: 'Glasgow revC3' })).toBeVisible();

  await page.getByRole('button', { name: 'Demo-Platine laden' }).click();
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.list li')).toHaveCount(8);

  // hover over the bad buck converter: the probe spectrum gets a peak line
  const canvas = page.locator('.canvas canvas');
  const box = (await canvas.boundingBox())!;
  const points: [number, number][] = [[0.3, 0.6], [0.32, 0.62], [0.35, 0.6]];
  for (const [fx, fy] of points) await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByText(/Höchste Linie/)).toBeVisible();

  // diagnostics list the built-in mistakes
  await page.getByRole('tab', { name: /Diagnose/ }).click();
  const diag = page.locator('.diag');
  await expect(diag.getByText(/Rückstrompfad unterbrochen/).first()).toBeVisible();
  await expect(diag.getByText(/Bezugswechsel am Via/).first()).toBeVisible();
  // speech bubbles in 3D: hint 1 carries the same finding as the top of the list
  const bubble1 = page.locator('.bubble.hint').filter({ has: page.locator('.badge', { hasText: /^1$/ }) });
  await expect(bubble1).toContainText('Takt schlecht');
  await expect(bubble1).toContainText(/über C2/);
  // ranked by far-field effect: the first hint is the bad clock's far transfer through C2
  await expect(page.locator('ol.ranked li').first()).toContainText('Takt schlecht');
  await expect(page.locator('ol.ranked li').first()).toContainText(/3 m: behoben 1\d,\d dB leiser/);

  // far field view with limit lines
  await page.getByRole('tab', { name: 'Fernfeld 3 m' }).click();
  await expect(page.locator('.limit')).toHaveText('CISPR 32 B');
  // another standard: the limit, the far-field section and the explanation follow
  await page.locator('select.standard').selectOption('fcc15-b');
  await expect(page.locator('.limit')).toHaveText('FCC 15 B');
  await expect(page.getByText(/Fernfeld-Orientierung \(FCC 15 B, 3 m\)/)).toBeVisible();
  await expect(page.locator('p.std')).toContainText('§15.109');

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
  await expect(page.locator('.list li')).toHaveCount(7);

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
  await expect(page.locator('.list li')).toHaveCount(8);
  await expect(page.getByText(/computed in \d+\.\d s/)).toBeVisible();
  await page.getByRole('tab', { name: /Diagnostics/ }).click();
  await expect(page.locator('.diag').getByText(/Return path broken/).first()).toBeVisible();

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

test('a link with ?demo opens the demo board', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.list li')).toHaveCount(8);
});

test('virtual scan: measure, background, difference to the simulation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Messung' }).click();
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await page.getByRole('button', { name: 'Scan starten' }).click();
  // whole demo board at 2 mm pitch: 41 × 26 points
  await expect(page.getByText(/· 1066 ·/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Hintergrund messen' }).click();
  await expect(page.getByText(/mit Hintergrund/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Differenz zur Simulation' }).click();
  await expect(page.getByText(/Rot: Messung lauter/)).toBeVisible();
  // the virtual rig measures the model itself: every source fits within a fraction of a dB
  await page.getByRole('button', { name: 'Quellen anpassen' }).click();
  await expect(page.getByText('Quellen an die Messung angepasst')).toBeVisible();
  await expect(page.getByText(/Rest nach der Anpassung/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('narrow window: settings open as a drawer, no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Messung' })).toBeHidden();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('tab', { name: 'Messung' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
});

test('live coupling: saving the board file again reloads it and keeps the sources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a fake File System Access handle stands in for the native file dialog
  await page.addInitScript(() => {
    const w = window as unknown as { __file: File; showOpenFilePicker: () => Promise<unknown[]> };
    w.showOpenFilePicker = async () => [{ kind: 'file', name: w.__file.name, getFile: async () => w.__file }];
  });
  await page.goto('/');
  // relative to the page: on CI the app lives under the repository path
  const text = await page.evaluate(() => fetch(new URL('demo/demo-board.kicad_pcb', document.baseURI)).then((r) => r.text()));
  await page.evaluate((t) => {
    (window as unknown as { __file: File }).__file = new File([t], 'demo-board.kicad_pcb', { lastModified: 1 });
  }, text);
  await page.getByRole('button', { name: 'Platine öffnen' }).click();
  await expect(page.getByRole('button', { name: 'live' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Alle übernehmen' }).click();
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  const count = await page.locator('.list li').count();
  expect(count).toBeGreaterThan(0);

  // "KiCad saves": a via moved by 1 mm
  await page.evaluate((t) => {
    (window as unknown as { __file: File }).__file = new File([t.replace('(at 140 125)', '(at 141 125)')], 'demo-board.kicad_pcb', { lastModified: 2 });
  }, text);
  await expect(page.getByText('Platine neu geladen (in KiCad gespeichert)')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.list li')).toHaveCount(count);

  await page.getByRole('button', { name: 'live' }).click();
  await expect(page.getByRole('button', { name: 'live' })).toBeHidden();
  expect(errors).toEqual([]);
});

test('full wave: the openEMS job export holds the simulated sources', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Job exportieren' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('demo-board.openems-job.json');
  const job = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
  expect(job.kind).toBe('pcb-field-fullwave-job');
  // six sources; the two inductors stay with the fast model
  expect(job.sources).toHaveLength(6);
  expect(job.skipped).toHaveLength(2);
});

test('report: one HTML file with picture, hints, hotspots, far field and sources', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /Diagnose/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bericht speichern' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('demo-board-emv-bericht.html');
  await file.saveAs('e2e/output/report.html');
  const html = await (await import('node:fs/promises')).readFile('e2e/output/report.html', 'utf8');
  expect(html).toContain('<img class="view" src="data:image/png;base64,');
  expect(html).toContain('Rückstrompfad unterbrochen');
  expect(html).toContain('Buck schlecht (U3)');
  expect(html).toContain('CISPR 32');
});

test('speech bubbles inside the scene with HTML-in-Canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.bubble').first()).toBeAttached();
  await page.getByText('Im Raum statt als Einblendung').click();
  // the bubbles are now children of the WebGL canvas, the overlay is gone
  const inCanvas = page.locator('.canvas canvas .wc');
  await expect(inCanvas.first()).toBeAttached();
  expect(await inCanvas.count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.bubble')).toHaveCount(0);
  await expect(inCanvas.filter({ hasText: /^1Takt schlecht/ })).toContainText('über C2');
  await page.screenshot({ path: 'e2e/output/world-callouts.png' });
  expect(errors).toEqual([]);
});

test('parts data for AI: export, and an answer with sources of values and missing parts', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /Diagnose/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bauteildaten für KI exportieren' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('demo-board.ai-request.json');
  const req = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
  expect(req.components.length).toBe(16);

  // the AI's answer: the same scenario plus provenance and a missing part
  const answer = {
    ...req.scenario,
    provenance: { 'clk-good/waveform.tr': { basis: 'datasheet', ref: 'Y1', source: 'https://example.org/y1.pdf', where: 'p. 3, Rise/Fall Time' } },
    missing: [{ ref: 'U2', mpn: 'MCU (Demo)', needed: ['load.cLoad of clk-good'], reason: 'no part number', assumed: '5 pF' }],
  };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Szenario laden' }).click();
  await (await chooser).setFiles({ name: 'answer.scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(answer)) });
  await expect(page.getByText('Herkunft der Bauteildaten')).toBeVisible();
  await expect(page.getByText('1 Bauteil ohne Daten')).toBeVisible();
  await expect(page.locator('.diag').getByText('U2 · MCU (Demo)')).toBeVisible();
  // the source editor shows where the edge time came from
  await page.locator('.list li').filter({ hasText: 'Takt gut' }).locator('.pick').click();
  await expect(page.getByText('Herkunft der Werte')).toBeVisible();
  await expect(page.locator('.origin')).toContainText('Datenblatt · Y1');
});

test('problem view: a click on a hint shows only what matters, with labels and editable inputs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?demo');
  await expect(page.getByText(/berechnet in/)).toBeVisible({ timeout: 30_000 });
  await page.locator('.bubble.hint').filter({ has: page.locator('.badge', { hasText: /^1$/ }) }).click();
  const card = page.locator('aside.card');
  await expect(card).toContainText('Was die Rechnung hier bemängelt');
  await expect(card).toContainText('3 m: behoben');
  // the explanation: what it is, why it radiates, what helps
  await expect(card).toContainText('Warum strahlt das ab?');
  await expect(card.locator('ol.fixes li').first()).toContainText('Bezugsnetz');
  await expect(card).toContainText('Zum Nachlesen');
  // severity, the calculation with this case's numbers, and the doubts
  await expect(card.locator('.severity .chip')).toHaveText('kritisch');
  await expect(card.locator('ol.calc')).toContainText('Dipolmoment');
  await expect(card.locator('ul.doubts')).toContainText('Kabel');
  // labels in the scene: the net with its values, the planes, the capacitor that carries the return
  await expect(page.locator('.labels .label.net')).toContainText('CLK_BAD');
  await expect(page.locator('.labels')).toContainText('GND · In1.Cu');
  await expect(page.locator('.labels')).toContainText('C2');
  // the best fix, drawn in at its place
  await expect(page.locator('.labels .label.fix')).toContainText('100 nF zwischen GND und +3V3');
  // the bubbles of the whole board are gone while the problem view is open
  await expect(page.locator('.bubble')).toHaveCount(0);
  // correcting an input reruns the calculation: slower edges, less emission
  const tr = card.locator('#fx-waveform\\.tr');
  await tr.fill('5 ns');
  await tr.press('Enter');
  await expect(card.locator('#fx-waveform\\.tr')).toHaveValue('5 ns');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.locator('.bubble').first()).toBeAttached();
  expect(errors).toEqual([]);
});
