import type { Timestamp } from 'firebase/firestore';

type Dateish = Timestamp | Date | null | undefined;

const toDate = (d: Dateish): Date | null => (!d ? null : d instanceof Date ? d : d.toDate());

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "12 Nov" this year, "12 Nov 2025" otherwise. */
export function shortDate(d: Dateish, now = new Date()): string {
  const x = toDate(d);
  if (!x) return '—';
  return x.getFullYear() === now.getFullYear() ? dayMonth.format(x) : dayMonthYear.format(x);
}

/** "10 Nov, 2:40 PM" */
export function dateTime(d: Dateish, now = new Date()): string {
  const x = toDate(d);
  return x ? `${shortDate(x, now)}, ${time.format(x)}` : '—';
}

/** Whole days from today's start to the date's start (negative = past). */
export function daysFromToday(d: Dateish, now = new Date()): number | null {
  const x = toDate(d);
  if (!x) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** <input type="date"> value ("2026-11-12") from a date. */
export function toDateInput(d: Dateish): string {
  const x = toDate(d);
  if (!x) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/** "2026-11-12" → that day at 6 pm local time (end of a working day), or null. */
export function fromDateInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 18, 0, 0) : null;
}

/** Date `n` days from today as an input value. */
export function inDays(n: number, now = new Date()): string {
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
}
