import { describe, expect, it } from 'vitest';
import { computeTotals, paymentStatus } from './invoiceTotals';

const lines = [
  { qty: 1, unitPrice: 650000 },
  { qty: 1, unitPrice: 950000 },
  { qty: 1, unitPrice: 250000 },
];

describe('computeTotals', () => {
  it('adds lines with no tax for shops not registered for VAT', () => {
    expect(computeTotals(lines, 0, { vatRegistered: false, taxRates: { vat: 18, sscl: 2.5 } })).toEqual({
      subtotal: 1850000,
      discount: 0,
      sscl: 0,
      vat: 0,
      total: 1850000,
    });
  });

  it('applies SSCL after discount, then VAT on the SSCL-inclusive value', () => {
    const t = computeTotals(lines, 50000, { vatRegistered: true, taxRates: { vat: 18, sscl: 2.5 } });
    expect(t.subtotal).toBe(1850000);
    expect(t.discount).toBe(50000);
    expect(t.sscl).toBe(45000); // 2.5% of 1,800,000
    expect(t.vat).toBe(332100); // 18% of 1,845,000
    expect(t.total).toBe(1800000 + 45000 + 332100);
  });

  it('never lets the discount go below zero or above the subtotal', () => {
    expect(computeTotals(lines, -100, { vatRegistered: false }).discount).toBe(0);
    expect(computeTotals(lines, 99999999, { vatRegistered: false }).total).toBe(0);
  });

  it('rounds tax to whole cents', () => {
    const t = computeTotals([{ qty: 1, unitPrice: 333 }], 0, { vatRegistered: true, taxRates: { vat: 18, sscl: 2.5 } });
    expect(Number.isInteger(t.sscl) && Number.isInteger(t.vat)).toBe(true);
  });
});

describe('paymentStatus', () => {
  it('matches the balance', () => {
    expect(paymentStatus(1000, 0)).toBe('unpaid');
    expect(paymentStatus(1000, 400)).toBe('partial');
    expect(paymentStatus(1000, 1000)).toBe('paid');
    expect(paymentStatus(0, 0)).toBe('paid');
  });
});
