import { describe, expect, it } from 'vitest';
import { byMethod, dailyTotals, daysIn, invoiceSummary, presetRange, readyByPerson, topParts } from './calc';

const now = new Date(2026, 10, 10, 15, 30); // 10 Nov 2026

describe('report ranges', () => {
  it('builds presets in local days', () => {
    const m = presetRange('month', now);
    expect(m.from).toEqual(new Date(2026, 10, 1));
    expect(m.to).toEqual(new Date(2026, 10, 11));
    expect(daysIn(presetRange('week', now))).toBe(7);
    const last = presetRange('lastMonth', now);
    expect(last.from).toEqual(new Date(2026, 9, 1));
    expect(daysIn(last)).toBe(31);
  });
});

describe('report maths', () => {
  it('fills every day, including days with no money', () => {
    const r = presetRange('week', now);
    const days = dailyTotals(
      [
        { amount: 500000, at: new Date(2026, 10, 10, 9) },
        { amount: 250000, at: new Date(2026, 10, 10, 17) },
        { amount: 100000, at: new Date(2026, 10, 6, 12) },
      ],
      r,
    );
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ day: '2026-11-10', total: 750000 });
    expect(days.find((d) => d.day === '2026-11-06')?.total).toBe(100000);
    expect(days[0].total).toBe(0);
  });

  it('groups payments by method, biggest first', () => {
    expect(
      byMethod([
        { amount: 100, method: 'cash' },
        { amount: 500, method: 'card' },
        { amount: 50, method: 'cash' },
      ]),
    ).toEqual([
      { method: 'card', total: 500, count: 1 },
      { method: 'cash', total: 150, count: 2 },
    ]);
  });

  it('ranks parts by revenue and skips void invoices and labour', () => {
    const parts = topParts([
      { status: 'paid', items: [{ description: 'SSD', kind: 'part', qty: 1, unitPrice: 1350000, inventoryId: 'ssd' }, { description: 'Fit', kind: 'labour', qty: 1, unitPrice: 500000 }] },
      { status: 'partial', items: [{ description: 'SSD 512', kind: 'part', qty: 2, unitPrice: 1350000, inventoryId: 'ssd' }, { description: 'Paste', kind: 'part', qty: 1, unitPrice: 100000 }] },
      { status: 'void', items: [{ description: 'Paste', kind: 'part', qty: 9, unitPrice: 100000 }] },
    ]);
    expect(parts).toEqual([
      { name: 'SSD', qty: 3, revenue: 4050000 },
      { name: 'Paste', qty: 1, revenue: 100000 },
    ]);
  });

  it('sums invoices without voids', () => {
    expect(
      invoiceSummary([
        { status: 'paid', total: 1000, discount: 100, tax: 0, type: 'repair' },
        { status: 'void', total: 5000, discount: 0, tax: 0, type: 'sale' },
        { status: 'unpaid', total: 300, discount: 0, tax: 30, type: 'sale' },
      ]),
    ).toEqual({ count: 2, voided: 1, total: 1300, discount: 100, tax: 30, sales: 1 });
  });

  it('counts jobs marked ready per person', () => {
    expect(
      readyByPerson([
        { toStatus: 'ready', byName: 'Sahan' },
        { toStatus: 'in_repair', byName: 'Sahan' },
        { toStatus: 'ready', byName: 'Ishara' },
        { toStatus: 'ready', byName: 'Sahan' },
      ]),
    ).toEqual([
      { name: 'Sahan', count: 2 },
      { name: 'Ishara', count: 1 },
    ]);
  });
});
