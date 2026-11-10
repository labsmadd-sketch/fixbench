// Renders public/icon.svg into the PNG icons phones need to install the app.
// Run after changing the icon: node scripts/make-icons.mjs (uses Edge or Chrome).
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browserPath = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!browserPath) throw new Error('No Edge or Chrome found; set BROWSER_PATH.');

const svg = readFileSync('public/icon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'fixbench-icons-')) });
const page = await browser.newPage();

// [file, size, maskable] — maskable icons keep the artwork inside the central safe zone.
for (const [file, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  await page.setViewport({ width: size, height: size });
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"').replace('translate(96 96) scale(13.33)', 'translate(128 128) scale(10.67)') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join('public/icons', file), omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote public/icons/' + file);
}
await browser.close();
