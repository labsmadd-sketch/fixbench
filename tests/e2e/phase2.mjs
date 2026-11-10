// End-to-end check of Phase 2 (customers, intake, tickets, status page, roles)
// in a real browser against the local emulators and the dev server.
//
//   terminal 1: npm run emulators
//   terminal 2: npm run dev
//   terminal 3: npm run test:e2e        (resets the emulator data first)
//
// Uses an installed Edge or Chrome (set BROWSER_PATH to override).
// Screenshots go to tests/e2e/shots/ (not committed).
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Edge or Chrome found. Set BROWSER_PATH to a Chromium-based browser.');
  process.exit(1);
}

// Known starting data: same counts and ticket numbers every run.
execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/seed-emulator.mjs', import.meta.url)), '--reset'], { stdio: 'ignore' });

let failures = 0;
const RUN = String(Date.now()).slice(-7); // unique phone per run
const NEW_PHONE = `076 ${RUN.slice(0, 3)} ${RUN.slice(3)}`;
const NEW_NAME = `Pradeep Senanayake`;
const ok = (m) => console.log('PASS', m);
const bad = (m) => { failures++; console.log('FAIL', m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'fixbench-e2e-')),
  defaultViewport: { width: 1360, height: 900 },
});

async function session(email) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bad(`page error (${email}): ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/PERMISSION_DENIED|permission/i.test(m.text())) console.log('  console:', m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await typeIn(page, '#email', email);
  await typeIn(page, '#password', 'password123');
  await page.click('button.btn--primary');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  return { ctx, page };
}
const typeIn = async (p, sel, v) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.type(sel, v); };
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 10000) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);
const clickText = async (page, sel, t) => {
  const el = await page.waitForSelector(`${sel}::-p-text(${t})`, { timeout: 10000 });
  await el.click();
};

try {
  // ---------- front desk ----------
  const { page } = await session('desk@demo.test');
  await waitText(page, 'Ready for pickup');
  await page.waitForFunction(() => !document.body.innerText.includes('…'), { timeout: 10000 }).catch(() => {});
  const dash = await text(page);
  check(/Open jobs\s*7/.test(dash), 'dashboard: 7 open jobs');
  check(/Overdue\s*3/.test(dash), 'dashboard: 3 overdue');
  check(/Ready for pickup\s*2/.test(dash), 'dashboard: 2 ready for pickup');
  await shot(page, '01-dashboard');

  await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table.data tbody tr');
  check((await page.$$('table.data tbody tr')).length === 7, 'tickets list: 7 open rows');
  const chips = await page.$eval('.chips', (e) => e.innerText);
  check(chips.includes('All open · 7') && chips.includes('Overdue · 3'), 'tickets chips counts');
  await shot(page, '02-tickets-list');
  await clickText(page, 'button', 'Board');
  await page.waitForSelector('.board__col');
  await shot(page, '03-tickets-board');

  // customers search
  await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' });
  await typeIn(page, '.split__search input', '077');
  await waitText(page, 'matches for');
  let t = await text(page);
  check(t.includes('Kasun Fernando') && t.includes('Chamara Wijesinghe'), 'customer search by partial phone');
    await page.click('.split__search input', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await typeIn(page, '.split__search input', 'fern');
  await page.waitForFunction(() => document.querySelector('.split__hint')?.textContent.includes('“fern”'));
  t = await text(page);
  check(t.includes('Kasun Fernando') && !t.includes('Chamara'), 'customer search by part of surname');
  await clickText(page, 'a.result', 'Kasun Fernando');
  await waitText(page, 'Devices');
  await waitText(page, 'Inspiron');
  await shot(page, '04-customer-profile');
  t = await text(page);
  check(t.includes('Dell Inspiron 15 3520') && t.includes('Epson L3110'), 'customer profile lists devices');

  // new customer: similar-name warning
  await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' });
  await typeIn(page, '#c-phone', '076 552 1098');
  await typeIn(page, '#c-name', 'Nadeesha Gunawardena');
  await waitText(page, 'Is this the same person?');
  ok('similar-name warning shown for Gunawardena vs Gunawardana');
  await waitText(page, 'No customer has this number yet');
  await shot(page, '05-new-customer-similar');

  // duplicate phone warning
  await page.click('#c-phone', { clickCount: 3 });
  await typeIn(page, '#c-phone', '+94 77 123 4567');
  await waitText(page, 'already has');
  ok('duplicate phone warning (+94 format matched 077 number)');

  // save a new customer and book in
  await page.click('#c-phone', { clickCount: 3 });
  await typeIn(page, '#c-phone', NEW_PHONE);
  await page.click('#c-name', { clickCount: 3 });
  await typeIn(page, '#c-name', 'Pradeep Senanayake');
  await waitText(page, 'No customer has this number yet');
  await clickText(page, 'button', 'Save and book in a device');
  await page.waitForFunction(() => location.pathname === '/tickets/new' && location.search.includes('customer='), { timeout: 10000 });
  ok('Save and book in a device opens intake with the customer filled in');
  await waitText(page, NEW_NAME);
  await waitText(page, 'first job');

  // intake: new device
  await page.waitForSelector('#nt-dev-brand');
  await typeIn(page, '#nt-dev-brand', 'HP');
  await typeIn(page, '#nt-dev-model', '250 G8');
  await typeIn(page, '#nt-dev-serial', 'cnd 1234 xyz');
  await typeIn(page, '#problem', 'Cracked screen, needs replacement');
  await clickText(page, 'button.toggle', 'Bag');
  await typeIn(page, '#estimate', '22,000');
  await typeIn(page, '#pin', '9999');
  await page.select('#tech', (await page.$$eval('#tech option', (o) => o.find((x) => x.textContent.startsWith('Sahan'))?.value)) ?? '');
  await shot(page, '06-new-ticket');
  await clickText(page, 'button', 'Create ticket and print receipt');
  await page.waitForFunction(() => /^\/tickets\/[A-Za-z0-9]+$/.test(location.pathname), { timeout: 15000 });
  await page.waitForSelector('.detail-head__title h1');
  const ticketNo = await page.$eval('.detail-head__title h1', (e) => e.textContent);
  check(/^T-\d{4}-0009$/.test(ticketNo), `ticket number issued in sequence (${ticketNo})`);
  await new Promise((r) => setTimeout(r, 900));
  check((await page.evaluate(() => window.__printed)) === 1, 'receipt print triggered once');
  check(await page.$eval('.print-only', (e) => !!e.querySelector('img.qr')), 'printed receipt has a QR code');
  await shot(page, '07-ticket-detail');
  const ticketUrl = page.url();

  // status change + note
  await clickText(page, 'button', 'Start diagnosis');
  await waitText(page, 'Diagnosing');
  await page.waitForFunction(() => document.querySelectorAll('.timeline li').length === 2);
  ok('status change adds a history entry');
  await typeIn(page, '#note', 'Customer wants original screen if possible');
  await clickText(page, 'button', 'Add');
  await waitText(page, 'Customer wants original screen');
  ok('internal note added');

  // public status page
  const statusHref = await page.$eval('a[href*="/status/"]', (a) => a.getAttribute('href'));
  const anon = await (await browser.createBrowserContext()).newPage();
  await anon.goto(statusHref, { waitUntil: 'domcontentloaded' });
  await waitText(anon, 'HP 250 G8');
  t = await text(anon);
  check(t.includes('Diagnosing') && t.includes(ticketNo) && !t.includes('Pradeep') && !t.includes(RUN), 'public status page shows the job without personal details');
  await anon.setViewport({ width: 390, height: 844 });
  await shot(anon, '08-public-status');
  await anon.goto(`${BASE}/status/00000000000000000000000000000000`, { waitUntil: 'domcontentloaded' });
  await waitText(anon, 'Job not found');
  ok('unknown token shows "Job not found"');

  // top-bar search by ticket number
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await typeIn(page, '.search input', ticketNo.toLowerCase());
  await page.keyboard.press('Enter');
  await page.waitForFunction((u) => location.href === u, { timeout: 10000 }, ticketUrl);
  ok('top-bar search opens a ticket by number');

  // ---------- technician ----------
  const tech = await session('tech@demo.test');
  await tech.page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded' });
  await waitText(tech.page, 'My jobs');
  await tech.page.waitForSelector('table.data tbody tr');
  const rows = await tech.page.$$eval('table.data tbody tr', (r) => r.map((x) => x.innerText));
  check(rows.length === 4 && rows.every((r) => !r.includes('Ishara')), `technician sees only own jobs (${rows.length})`);
  await shot(tech.page, '09-tech-my-jobs');

  // Tharindu's desktop: assigned to Sahan, PIN 4321
  await clickText(tech.page, 'a.row-link', `-0003`);
  await waitText(tech.page, 'Device password');
  await clickText(tech.page, 'button', 'Show');
  await waitText(tech.page, '4321');
  ok('assigned technician can see the device PIN');
  check(!(await text(tech.page)).includes('Delete now'), 'technician cannot delete the PIN by hand');
  await clickText(tech.page, 'button', 'Change status');
  const options = await tech.page.$$eval('dialog .choice strong', (e) => e.map((x) => x.textContent));
  check(!options.includes('Collected') && !options.includes('Cancelled'), 'technician cannot choose Collected or Cancelled');
  await tech.page.keyboard.press('Escape');
  await clickText(tech.page, 'button', 'Mark ready');
  await waitText(tech.page, 'Ready for pickup');
  ok('technician marks own job ready');

  // Dilani's MacBook: assigned to Ishara → PIN hidden from Sahan
  await tech.page.goto(`${BASE}/tickets?who=all`, { waitUntil: 'domcontentloaded' });
  await clickText(tech.page, 'a.row-link', `-0007`);
  await waitText(tech.page, 'Device password');
  await clickText(tech.page, 'button', 'Show');
  await waitText(tech.page, 'Only the owner, managers and the assigned technician');
  ok('other technician cannot see the PIN');
  check(!(await text(tech.page)).includes('Change status'), 'no status controls on someone else’s job');

  // ---------- desk hands over: PIN deleted ----------
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' });
  await clickText(page, 'button', 'Change status');
  await clickText(page, 'dialog .choice', 'Collected');
  await clickText(page, 'dialog button', 'Save');
  await waitText(page, 'Deleted when the job was closed.');
  ok('collecting the device deletes the stored PIN');

  // phone width
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table.data tbody tr');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'tickets page has no horizontal scroll at 390px');
  await shot(page, '10-tickets-phone');
} catch (e) {
  bad(`stopped: ${e.message}`);
  const pages = (await Promise.all(browser.browserContexts().map((c) => c.pages()))).flat();
  for (const [i, p] of pages.entries()) await shot(p, `zz-fail-${i}`).catch(() => {});
} finally {
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}
