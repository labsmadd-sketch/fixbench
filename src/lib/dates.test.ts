import { describe, expect, it } from 'vitest';
import { daysFromToday, fromDateInput, inDays, shortDate, toDateInput } from './dates';

const now = new Date(2026, 10, 10, 15, 0); // 10 Nov 2026, 3 pm

describe('dates', () => {
  it('formats short dates relative to this year', () => {
    expect(shortDate(new Date(2026, 10, 12), now)).toBe('12 Nov');
    expect(shortDate(new Date(2025, 2, 4), now)).toBe('4 Mar 2025');
    expect(shortDate(null, now)).toBe('—');
  });

  it('counts whole days, ignoring the time of day', () => {
    expect(daysFromToday(new Date(2026, 10, 10, 23, 59), now)).toBe(0);
    expect(daysFromToday(new Date(2026, 10, 8, 1), now)).toBe(-2);
    expect(daysFromToday(new Date(2026, 10, 13), now)).toBe(3);
  });

  it('round-trips date inputs', () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromDateInput('2026-11-12')?.getDate()).toBe(12);
    expect(fromDateInput('12/11/2026')).toBeNull();
    expect(inDays(3, now)).toBe('2026-11-13');
  });
});
