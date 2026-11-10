import { describe, expect, it } from 'vitest';
import { counterId, formatNumber, isValidPrefix } from './numberFormat';

const jan = new Date(2026, 0, 3);

describe('numbering', () => {
  it('formats yearly and running numbers', () => {
    expect(formatNumber('INV', 1, 'yearly', jan)).toBe('INV-2026-0001');
    expect(formatNumber('T', 142, undefined, jan)).toBe('T-2026-0142');
    expect(formatNumber('Q', 12345, 'never', jan)).toBe('Q-12345');
  });

  it('picks the counter document', () => {
    expect(counterId('yearly', jan)).toBe('2026');
    expect(counterId(undefined, jan)).toBe('2026');
    expect(counterId('never', jan)).toBe('all');
  });

  it('accepts short capital prefixes only', () => {
    for (const ok of ['T', 'INV', 'JOB', 'R2']) expect(isValidPrefix(ok)).toBe(true);
    for (const bad of ['', 'inv', '2T', 'TOOLONG', 'IN-V']) expect(isValidPrefix(bad)).toBe(false);
  });
});
