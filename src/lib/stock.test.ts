import { describe, expect, it } from 'vitest';
import { adjustmentDelta, isLow, margin, stockNeeds } from './stock';

describe('stock helpers', () => {
  it('adds up units per item and ignores non-stock lines', () => {
    const need = stockNeeds([
      { inventoryId: 'ssd', qty: 1 },
      { qty: 1 },
      { inventoryId: 'ssd', qty: 2 },
      { inventoryId: 'ram', qty: 1 },
    ]);
    expect([...need]).toEqual([
      ['ssd', 3],
      ['ram', 1],
    ]);
  });

  it('flags low stock at or below the reorder level', () => {
    expect(isLow(3, 3)).toBe(true);
    expect(isLow(4, 3)).toBe(false);
    expect(isLow(0, 0)).toBe(true);
  });

  it('turns an adjustment into a stock change', () => {
    expect(adjustmentDelta('received', 5, 1)).toBe(5);
    expect(adjustmentDelta('damaged', 2, 4)).toBe(-2);
    expect(adjustmentDelta('count', 3, 7)).toBe(-4);
    expect(adjustmentDelta('count', 7, 3)).toBe(4);
  });

  it('works out margin on the selling price', () => {
    expect(margin(980000, 1350000)).toEqual({ amount: 370000, percent: 27 });
    expect(margin(100, 0)).toEqual({ amount: -100, percent: 0 });
  });
});
