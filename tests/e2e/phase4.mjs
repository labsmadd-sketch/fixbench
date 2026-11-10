// Browser test of Phase 4: inventory, quotes, stock-checked invoices,
// counter sales and restocking on void. See helpers.mjs for setup.
import { start } from './helpers.mjs';

const t = await start('phase4');
const { check, ok, shot, typeIn, replace, text, waitText, clickText, go } = t;

/** WhatsApp links would open wa.me; keep the click (and its side effects) but stay offline. */
const blockWhatsApp = (page) =>
  page.evaluate(() =>
    document.addEventListener(
      'click',
      (e) => {
        if (e.target.closest?.('a[href*="wa.me"]')) e.preventDefault();
      },
      true,
    ),
  );

/** Wait until a detail page (quote, invoice) shows its number. */
const numberOf = async (page, prefix) => {
  await page.waitForFunction((p) => document.querySelector('.detail-head__title h1')?.textContent?.startsWith(p), { timeout: 15000 }, prefix);
  return page.$eval('.detail-head__title h1', (e) => e.textContent);
};

const pickStock = async (page, name) => {
  await clickText(page, 'button.toggle', '+ From stock');
  await typeIn(page, '.picker input', name);
  await clickText(page, '.picker__item', name);
};

try {
  // ---------- manager: stock ----------
  const mgr = await t.session('manager@demo.test');
  await waitText(mgr, '3 low');
  ok('sidebar shows 3 low-stock items');
  await go(mgr, '/inventory');
  await mgr.waitForFunction(() => document.querySelectorAll('table.data tbody tr').length === 7, { timeout: 10000 });
  ok('inventory lists 7 items');
  await waitText(mgr, 'Low stock · 3');
  await clickText(mgr, 'table.data td', 'SSD 512 GB NVMe');
  await waitText(mgr, 'LKR 3,700.00 (27%)');
  ok('item panel shows margin');
  await typeIn(mgr, '#adj-qty', '5');
  await typeIn(mgr, '#adj-note', 'Supplier bill 77');
  await clickText(mgr, 'form button', 'Save');
  await waitText(mgr, 'Supplier bill 77');
  await waitText(mgr, '2 low');
  ok('receiving 5 records a movement and clears the low flag');
  await shot(mgr, '01-inventory');

  await clickText(mgr, 'button', 'Add item');
  await typeIn(mgr, '#it-name', 'Laptop battery — Dell');
  await typeIn(mgr, '#it-sku', 'bat-dl');
  await typeIn(mgr, '#it-cost', '5000');
  await typeIn(mgr, '#it-price', '8500');
  await replace(mgr, '#it-low', '1');
  await typeIn(mgr, '#it-open', '2');
  await clickText(mgr, 'dialog button', 'Add item');
  await waitText(mgr, 'BAT-DL');
  ok('manager adds an item with opening stock');

  // ---------- technician writes and sends a quote ----------
  const tech = await t.session('tech2@demo.test'); // Ishara: Dilani's MacBook is diagnosing
  await go(tech, '/tickets');
  await clickText(tech, 'a.row-link', '-0007');
  await clickText(tech, 'a', 'Write a quote');
  await tech.waitForSelector('#q-diag');
  await typeIn(tech, '#q-diag', 'Keyboard ribbon damaged by a spill. Keyboard needs replacing.');
  const descs = await tech.$$('.line__desc input');
  await descs[0].type('Keyboard — MacBook Air M1');
  const prices = await tech.$$('.line .field:nth-child(4) input');
  await prices[0].type('18000');
  await prices[1].type('6000');
  await clickText(tech, 'button.toggle', '+ Other');
  await (await tech.$$('.line__desc input')).at(-1).type('Battery health check');
  await (await tech.$$('.line .field:nth-child(4) input')).at(-1).type('1500');
  await (await tech.$$('.line__meta input[type=checkbox]')).at(-1).click();
  await waitText(tech, 'LKR 24,000.00');
  await waitText(tech, '25,500.00');
  ok('quote totals: 24,000 recommended, 25,500 with optional');
  await shot(tech, '02-quote-editor');
  await clickText(tech, 'button', 'Save quote');
  const quoteNo = await numberOf(tech, 'Q-');
  check(/^Q-\d{4}-0002$/.test(quoteNo), `quote numbered in sequence (${quoteNo})`);
  await waitText(tech, 'Draft');
  await blockWhatsApp(tech);
  await clickText(tech, 'a', 'Send on WhatsApp');
  await waitText(tech, 'Waiting for customer');
  ok('sending marks the quote as waiting for the customer');
  await clickText(tech, '.choice', 'Approved + optional items');
  await tech.select('#via', 'call');
  await clickText(tech, 'button', 'Save answer');
  await waitText(tech, 'with optional items');
  await go(tech, tech.url().replace(/^.*\/quotes\/.*$/, '/tickets?who=all'));
  await clickText(tech, 'a.row-link', '-0007');
  await waitText(tech, 'Awaiting parts');
  await waitText(tech, 'approved by phone call (with optional items)');
  ok('approval moves the job to Awaiting parts with a history note');

  // ---------- front desk invoices from the approved quote, using stock ----------
  const desk = await t.session('desk@demo.test');
  await go(desk, '/quotes?f=approved');
  await clickText(desk, 'a.row-link', quoteNo);
  await clickText(desk, 'a', 'Invoice from this quote');
  await waitText(desk, 'Filled in from quote');
  check((await desk.$$('.line')).length === 3, 'invoice prefilled with the 3 approved lines');
  await pickStock(desk, 'SSD 512');
  await waitText(desk, 'From stock · SSD-512-NV · 6 in stock');
  await waitText(desk, 'LKR 39,000.00');
  ok('stock part added at its selling price (25,500 + 13,500)');
  await clickText(desk, 'button', 'Issue invoice');
  const invNo = await numberOf(desk, 'INV-');
  ok(`invoice ${invNo} issued from the quote`);

  // ---------- counter sale: stock limit, then walk-in sale ----------
  await go(desk, '/invoices/new?sale=1');
  await waitText(desk, 'Walk-in customer');
  await pickStock(desk, 'Thermal paste');
  await replace(desk, '.line__qty input', '5');
  await clickText(desk, 'button', 'Issue invoice');
  await waitText(desk, 'Only 3 in stock.');
  ok('cannot sell more than is in stock');
  await replace(desk, '.line__qty input', '2');
  await clickText(desk, 'button', 'Issue invoice');
  const saleNo = await numberOf(desk, 'INV-');
  await waitText(desk, 'Walk-in customer');
  ok(`walk-in counter sale ${saleNo} issued`);
  await shot(desk, '03-counter-sale');

  await go(desk, '/inventory');
  await clickText(desk, 'table.data td', 'Thermal paste 4g');
  await waitText(desk, `Sold · ${saleNo}`);
  check(!(await text(desk)).includes('Adjust stock') && !(await text(desk)).includes('Add item'), 'front desk can view stock but not adjust it');
  await clickText(desk, 'table.data td', 'SSD 512 GB NVMe');
  await waitText(desk, `Sold · ${invNo}`);
  ok('invoices deduct stock with a movement each');

  // ---------- owner voids the sale: stock comes back ----------
  const owner = await t.session('owner@demo.test');
  await go(owner, '/invoices?f=all');
  await clickText(owner, 'a.row-link', saleNo);
  await clickText(owner, 'button', 'Void');
  await typeIn(owner, '#void-reason', 'Customer changed their mind');
  await clickText(owner, 'dialog button', 'Void invoice');
  await waitText(owner, 'stays used');
  await go(owner, '/inventory');
  await clickText(owner, 'table.data td', 'Thermal paste 4g');
  await waitText(owner, 'Returned (invoice voided)');
  const paste = await owner.$$eval('table.data tbody tr', (rows) => rows.find((r) => r.innerText.includes('Thermal paste'))?.innerText ?? '');
  check(/\b3\b/.test(paste), 'voiding returns the 2 units (back to 3)');

  // ---------- dashboard low stock ----------
  await go(owner, '/');
  await waitText(owner, 'Low stock');
  ok('dashboard lists low stock');
  await shot(owner, '04-dashboard');

  await t.finish();
} catch (e) {
  await t.finish(e);
}
