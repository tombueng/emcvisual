import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5175',
    locale: 'de-DE',
    viewport: { width: 1440, height: 900 },
    // WebGL in headless Chromium runs on SwiftShader
    // HTML-in-Canvas (speech bubbles inside the scene) is an origin trial; the flag turns it on
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-blink-features=CanvasDrawElement'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, locale: 'de-DE' } }],
  webServer: {
    command: 'npm run dev -- --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
