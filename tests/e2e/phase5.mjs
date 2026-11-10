// Browser test of Phase 5: reports, settings, staff on/off, data export, PWA files.
import { BASE, start } from './helpers.mjs';

const t = await start('phase5');
const { check, ok, shot, typeIn, replace, text, waitText, clickText, go } = t;

/** Click a button inside the staff row for `name`. */
const rowButton = (page, name, label) =>
  page.waitForFunction(
    (n, l) => {
      const row = [...document.querySelectorAll('.person')].find((r) => r.textContent.includes(n));
      const btn = row && [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === l);
      if (btn) btn.click();
      return !!btn;
    },
    { timeout: 10000 },
    name,
    label,
  );

try {
  // ---------- a cash counter sale today, so the report has something to show ----------
  const desk = await t.session('desk@demo.test');
  await go(desk, '/invoices/new?sale=1');
  await clickText(desk, 'button.toggle', '+ From stock');
  await typeIn(desk, '.picker input', 'USB');
  await clickText(desk, '.picker__item', 'USB flash drive');
  await clickText(desk, 'button', 'Issue invoice');
  await desk.waitForFunction(() => document.querySelector('.detail-head__title h1')?.textContent?.startsWith('INV-'), { timeout: 15000 });
  await clickText(desk, 'button', 'Record LKR 2,200.00');
  await waitText(desk, 'Paid in full', 15000).catch(async () => waitText(desk, 'Paid'));
  ok('cash sale of LKR 2,200 recorded');

  // ---------- reports ----------
  const owner = await t.session('owner@demo.test');
  await go(owner, '/reports');
  await clickText(owner, 'button.chip', 'Today');
  await waitText(owner, '1 payment');
  const r = await text(owner);
  check(r.includes('LKR 2,200.00'), 'money taken today: LKR 2,200.00');
  check(r.includes('USB flash drive 64 GB'), 'top parts lists the USB drive');
  check(/Cash\s+1\s+2,200\.00/.test(r), 'payment methods: 1 cash payment');
  check(/Outstanding now\s+LKR 0\.00/.test(r), 'nothing outstanding');

  await clickText(owner, 'button.chip', 'Last 7 days');
  await owner.waitForFunction(() => document.querySelectorAll('.chart rect[tabindex="0"]').length === 7, { timeout: 10000 });
  ok('chart has one column per day (7)');
  // The chart measures its container once shown; wait until it has its final width.
  await owner.waitForFunction(() => {
    const svg = document.querySelector('.chart svg');
    return svg && Math.abs(svg.getBoundingClientRect().width - svg.parentElement.clientWidth) < 2;
  });
  // Hover today's column (the last day group) by selector, so a re-render cannot detach it.
  const box = await owner.evaluate(() => {
    const cols = document.querySelectorAll('.chart rect[tabindex="0"]');
    const b = cols[cols.length - 1].getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await owner.mouse.move(box.x - 200, box.y, { steps: 2 });
  await owner.mouse.move(box.x, box.y, { steps: 8 });
  await owner.waitForSelector('.chart__tip', { timeout: 5000 });
  check((await owner.$eval('.chart__tip', (e) => e.innerText)).includes('LKR 2,200.00'), 'hovering today shows its amount');
  await shot(owner, '01-reports');

  // ---------- settings ----------
  await go(owner, '/settings');
  await replace(owner, '#shop-phone', '011 222 3344');
  await clickText(owner, 'button', 'Save changes');
  await waitText(owner, 'Saved.');
  check((await owner.$eval('#shop-phone', (e) => e.value)) === '011 222 3344', 'shop phone saved in Settings');
  await clickText(owner, '.settings__tab', 'Logo and colours');
  await waitText(owner, 'Save for all staff');
  ok('logo and colours tab uses the wizard screen with a save button');

  await clickText(owner, '.settings__tab', 'Staff and roles');
  await waitText(owner, 'Ishara Silva');
  await rowButton(owner, 'Ishara Silva', 'Turn off');
  await waitText(owner, 'Turned off');
  const off = await t.session('tech2@demo.test').catch(() => null);
  if (off) {
    t.bad('turned-off technician could still reach the app');
  } else {
    ok('turned-off account cannot get in');
  }
  await rowButton(owner, 'Ishara Silva', 'Turn on');
  await owner.waitForFunction(() => !document.body.innerText.includes('Turned off'));
  ok('account turned back on');
  await rowButton(owner, 'Ishara Silva', 'Reset password');
  await waitText(owner, 'Reset email sent');
  ok('password reset email sent');
  await shot(owner, '02-settings-staff');

  // ---------- data export ----------
  // Capture the downloaded file inside the page (downloads from separate browser contexts are awkward).
  await owner.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloadName = this.download;
        fetch(this.href).then((r) => r.text()).then((x) => (window.__download = x));
        return;
      }
      return click.call(this);
    };
  });
  await clickText(owner, '.settings__tab', 'Data and backup');
  await clickText(owner, 'button', 'Export all data');
  await waitText(owner, 'Downloaded:', 20000);
  await owner.waitForFunction(() => typeof window.__download === 'string', { timeout: 10000 });
  const raw = await owner.evaluate(() => window.__download);
  check(/^fixbench-.+\.json$/.test(await owner.evaluate(() => window.__downloadName)), 'export file is named fixbench-<project>-<date>.json');
  const dump = JSON.parse(raw);
  check(dump.app === 'FixBench' && dump.counts.customers >= 8 && dump.counts.tickets >= 8 && dump.counts.payments >= 2, 'export has customers, tickets and payments');
  check(dump.counts.movements > 0 && dump.counts.history > 0, 'export includes history and stock movements');
  check(!raw.includes('483920') && !raw.includes('"pin"'), 'export leaves out device passwords');

  // ---------- installable app files ----------
  const manifest = await owner.evaluate(async (base) => (await fetch(`${base}/manifest.webmanifest`)).json(), BASE);
  check(manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512'), 'manifest is installable (standalone, 512px icon)');
  const sw = await owner.evaluate(async (base) => (await fetch(`${base}/sw.js`)).status, BASE);
  check(sw === 200, 'service worker file is served');

  // ---------- phone width ----------
  await owner.setViewport({ width: 390, height: 844 });
  await go(owner, '/reports');
  await waitText(owner, 'Money taken');
  check(!(await owner.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'reports fit a phone screen');
  await shot(owner, '03-reports-phone');

  await t.finish();
} catch (e) {
  await t.finish(e);
}
