import { describe, expect, it } from 'vitest';
import { formatAmount, parseToCents, sumLines } from './money';

describe('money', () => {
  it('parses typed amounts to cents', () => {
    expect(parseToCents('18,500.00')).toBe(1850000);
    expect(parseToCents('LKR 12,500')).toBe(1250000);
    expect(parseToCents('0.5')).toBe(50);
    expect(parseToCents('12.345')).toBeNull();
    expect(parseToCents('abc')).toBeNull();
  });

  it('formats cents with two decimals', () => {
    expect(formatAmount(1850000)).toBe('18,500.00');
  });

  it('adds line items without float drift', () => {
    const items = [
      { qty: 3, unitPrice: 10 }, // 0.10 × 3
      { qty: 1, unitPrice: 20 },
    ];
    expect(sumLines(items)).toBe(50);
  });
});
