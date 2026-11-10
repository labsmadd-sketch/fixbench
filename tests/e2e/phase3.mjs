// Browser test of Phase 3: invoices, advance, part payments, hand-over,
// printing, voiding and who can see money. See helpers.mjs for setup.
import { start } from './helpers.mjs';

const t = await start('phase3');
const { check, ok, shot, typeIn, replace, text, waitText, clickText, go } = t;

try {
  // ---------- front desk invoices a ready job with an advance ----------
  const desk = await t.session('desk@demo.test');
  await waitText(desk, 'Taken today');
  await waitText(desk, 'No payments yet today');
  ok('dashboard shows the money tiles to the counter');

  await go(desk, '/tickets?f=ready');
  await clickText(desk, 'a.row-link', '-0006');
  await clickText(desk, 'a', 'Take payment and hand over');
  await desk.waitForFunction(() => location.pathname === '/invoices/new');
  await waitText(desk, 'Advance taken at intake');
  ok('ready job leads to a new invoice with the advance');

  // Prefilled repair line is 18,500; add a part and a discount.
  await clickText(desk, 'button.toggle', '+ Part');
  const descs = await desk.$$('.line__desc input');
  await descs[1].type('DC power jack with cable');
  check((await desk.$$('.line')).length === 2, 'two invoice lines');
  // Columns: description, type, qty, unit price
  const lastPrice = (await desk.$$('.line .field:nth-child(4) input')).at(-1);
  await lastPrice.type('6500');
  await typeIn(desk, '#discount', '1000');
  await waitText(desk, 'LKR 24,000.00');
  ok('totals: 18,500 + 6,500 − 1,000 = 24,000');
  await waitText(desk, 'LKR 18,000.00');
  ok('balance after the 6,000 advance is 18,000');
  await shot(desk, '01-new-invoice');

  await clickText(desk, 'button', 'Issue invoice');
  await desk.waitForFunction(() => /^\/invoices\/[A-Za-z0-9]+$/.test(location.pathname), { timeout: 15000 });
  await desk.waitForSelector('.detail-head__title h1');
  const invNo = await desk.$eval('.detail-head__title h1', (e) => e.textContent);
  check(/^INV-\d{4}-0002$/.test(invNo), `invoice number issued in sequence (${invNo})`);
  await waitText(desk, 'Partly paid');
  await waitText(desk, 'Advance · Cash');
  ok('advance recorded as the first payment');
  const invoiceUrl = desk.url();

  // Part payment by card
  await desk.waitForSelector('#pay-amount');
  check((await desk.$eval('#pay-amount', (e) => e.value)) === '18000', 'payment amount pre-filled with the balance');
  await replace(desk, '#pay-amount', '8000');
  await clickText(desk, '.choice', 'Card');
  await typeIn(desk, '#pay-ref', 'slip 123');
  await clickText(desk, 'button', 'Record LKR 8,000.00');
  await waitText(desk, 'slip 123');
  await desk.waitForFunction(() => document.querySelector('#pay-amount')?.value === '10000', { timeout: 10000 });
  ok('part payment recorded; amount refilled with the new balance');

  // Pay the rest in cash, then hand over
  await clickText(desk, '.choice', 'Cash');
  await clickText(desk, 'button', 'Record LKR 10,000.00');
  await waitText(desk, 'Paid in full');
  check(!(await desk.$('#pay-amount')), 'payment form gone when fully paid');
  await shot(desk, '02-invoice-paid');
  await clickText(desk, 'button', 'as collected');
  await waitText(desk, 'Collected');
  ok('job marked collected from the invoice');

  await desk.click('.actions button');
  check((await desk.evaluate(() => window.__printed)) === 1, 'print / save as PDF triggered');
  const printed = await desk.$eval('.invoice-print', (e) => e.innerText);
  check(printed.includes('INVOICE') && printed.includes('Not a tax invoice') && printed.includes('24,000.00'), 'A4 invoice has title, tax note and total');
  await desk.setViewport({ width: 794, height: 1123 });
  await desk.emulateMediaType('print');
  await shot(desk, '04-printed-invoice');
  await desk.emulateMediaType('screen');
  await desk.setViewport({ width: 1360, height: 900 });

  // Dashboard: taken today = 8,000 card + 10,000 cash (advance was days ago)
  await go(desk, '/');
  await waitText(desk, 'LKR 18,000.00');
  const dash = await text(desk);
  check(dash.includes('Card 8,000.00') && dash.includes('Cash 10,000.00'), 'taken today split by method');
  await shot(desk, '03-dashboard');

  // Invoices list
  await go(desk, '/invoices');
  await waitText(desk, 'Nothing waiting to be paid');
  await clickText(desk, 'button.chip', 'Paid');
  await desk.waitForFunction(() => document.querySelectorAll('table.data tbody tr').length === 2);
  ok('invoices list filters by status');

  // ---------- manager cannot void; owner voids ----------
  const manager = await t.session('manager@demo.test');
  await go(manager, invoiceUrl.replace(/^.*\/invoices/, '/invoices'));
  await waitText(manager, invNo);
  check(!(await text(manager)).includes('Void'), 'manager has no Void button');

  const owner = await t.session('owner@demo.test');
  await go(owner, '/invoices?f=paid');
  await clickText(owner, 'a.row-link', '-0001');
  await clickText(owner, 'button', 'Void');
  await typeIn(owner, '#void-reason', 'Issued twice by mistake');
  await clickText(owner, 'dialog button', 'Void invoice');
  await waitText(owner, 'Issued twice by mistake');
  await waitText(owner, 'stays used');
  ok('owner voids with a reason; the number stays used');

  // Customer totals ignore the void invoice
  await go(owner, '/customers/c-kasun');
  await waitText(owner, 'Total spent');
  await waitText(owner, '24,000.00');
  ok('customer total spent excludes the voided invoice');

  // ---------- technician sees no money ----------
  const tech = await t.session('tech@demo.test');
  await go(tech, '/invoices');
  await waitText(tech, 'Not available for your role');
  ok('technician cannot open invoices');
  await go(tech, '/');
  await waitText(tech, 'My open jobs');
  check(!(await text(tech)).includes('Taken today'), 'technician dashboard has no money tiles');
  await go(tech, '/tickets?who=all&f=closed');
  await clickText(tech, 'a.row-link', '-0006');
  await waitText(tech, 'Status history');
  const tt = await text(tech);
  check(!tt.includes('Take payment') && !tt.includes('INV-'), 'technician ticket page shows no invoice');

  await t.finish();
} catch (e) {
  await t.finish(e);
}
