// Shared setup for the browser tests: finds Edge/Chrome, resets the emulator
// data, signs in as a demo user, and small wait/click helpers.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** Reset demo data, launch the browser, return helpers bound to it. */
export async function start(name) {
  const executablePath = BROWSERS.find((p) => existsSync(p));
  if (!executablePath) {
    console.error('No Edge or Chrome found. Set BROWSER_PATH to a Chromium-based browser.');
    process.exit(1);
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/seed-emulator.mjs', import.meta.url)), '--reset'], { stdio: 'ignore' });

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: mkdtempSync(join(tmpdir(), 'fixbench-e2e-')),
    defaultViewport: { width: 1360, height: 900 },
  });

  let failures = 0;
  const ok = (m) => console.log('PASS', m);
  const bad = (m) => {
    failures++;
    console.log('FAIL', m);
  };

  const t = {
    browser,
    ok,
    bad,
    check: (cond, m) => (cond ? ok(m) : bad(m)),
    shot: (page, n) => page.screenshot({ path: join(SHOTS, `${name}-${n}.png`), fullPage: true }),
    typeIn: async (p, sel, v) => {
      await p.waitForSelector(sel, { timeout: 15000 });
      await p.type(sel, v);
    },
    replace: async (p, sel, v) => {
      await p.waitForSelector(sel, { timeout: 15000 });
      await p.click(sel, { clickCount: 3 });
      await p.keyboard.press('Backspace');
      await p.type(sel, v);
    },
    text: (page) => page.evaluate(() => document.body.innerText),
    waitText: (page, s, timeout = 10000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, s),
    clickText: async (page, sel, s) => {
      const el = await page.waitForSelector(`${sel}::-p-text(${s})`, { timeout: 10000 });
      await el.click();
    },
    go: (page, path) => page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }),

    /** New browser context signed in as a demo user. window.print is stubbed. */
    async session(email) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => bad(`page error (${email}): ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/PERMISSION_DENIED|permission/i.test(m.text())) console.log('  console:', m.text().slice(0, 200));
      });
      await page.evaluateOnNewDocument(() => {
        window.print = () => {
          window.__printed = (window.__printed || 0) + 1;
        };
      });
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await t.typeIn(page, '#email', email);
      await t.typeIn(page, '#password', 'password123');
      await page.click('button.btn--primary');
      await page.waitForSelector('.sidebar', { timeout: 15000 });
      return page;
    },

    /** Screenshot every open page on failure, close the browser, set the exit code. */
    async finish(error) {
      if (error) {
        bad(`stopped: ${error.message}`);
        const pages = (await Promise.all(browser.browserContexts().map((c) => c.pages()))).flat();
        for (const [i, p] of pages.entries()) await t.shot(p, `zz-fail-${i}`).catch(() => {});
      }
      await browser.close();
      console.log(failures ? `\n${name}: ${failures} check(s) failed` : `\n${name}: all checks passed`);
      if (failures) process.exitCode = 1;
    },
  };
  return t;
}
