// Report maths, kept free of Firebase so it can be unit-tested.
import type { Cents } from '../../lib/money';
import type { InvoiceItem, PaymentMethod } from '../../types';

export type Range = { from: Date; to: Date }; // to is exclusive

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Preset ranges, local time. `to` is the start of the day after the last day. */
export function presetRange(preset: 'today' | 'week' | 'month' | 'lastMonth', now = new Date()): Range {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  switch (preset) {
    case 'today':
      return { from: today, to: tomorrow };
    case 'week':
      return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), to: tomorrow };
    case 'month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
    case 'lastMonth':
      return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
  }
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One entry per day in the range (days with no money included as 0). */
export function dailyTotals(payments: { amount: Cents; at: Date }[], range: Range): { day: string; date: Date; total: Cents }[] {
  const sums = new Map<string, Cents>();
  for (const p of payments) sums.set(dayKey(p.at), (sums.get(dayKey(p.at)) ?? 0) + p.amount);
  const out: { day: string; date: Date; total: Cents }[] = [];
  for (let d = startOfDay(range.from); d < range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    out.push({ day: dayKey(d), date: d, total: sums.get(dayKey(d)) ?? 0 });
  }
  return out;
}

export function byMethod(payments: { amount: Cents; method: PaymentMethod }[]): { method: PaymentMethod; total: Cents; count: number }[] {
  const m = new Map<PaymentMethod, { total: Cents; count: number }>();
  for (const p of payments) {
    const x = m.get(p.method) ?? { total: 0, count: 0 };
    m.set(p.method, { total: x.total + p.amount, count: x.count + 1 });
  }
  return [...m].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total);
}

/** Parts sold, grouped by stock item (or description for typed-in parts), most revenue first. */
export function topParts(invoices: { status: string; items: InvoiceItem[] }[], limit = 10) {
  const m = new Map<string, { name: string; qty: number; revenue: Cents }>();
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    for (const it of inv.items) {
      if (it.kind !== 'part') continue;
      const key = it.inventoryId ?? `text:${it.description.trim().toLowerCase()}`;
      const x = m.get(key) ?? { name: it.description.trim(), qty: 0, revenue: 0 };
      m.set(key, { ...x, qty: x.qty + it.qty, revenue: x.revenue + Math.round(it.qty * it.unitPrice) });
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Invoiced totals for the range, voids excluded. */
export function invoiceSummary(invoices: { status: string; total: Cents; discount: Cents; tax: Cents; type: string }[]) {
  const live = invoices.filter((i) => i.status !== 'void');
  return {
    count: live.length,
    voided: invoices.length - live.length,
    total: live.reduce((s, i) => s + i.total, 0),
    discount: live.reduce((s, i) => s + i.discount, 0),
    tax: live.reduce((s, i) => s + i.tax, 0),
    sales: live.filter((i) => i.type === 'sale').length,
  };
}

/** Jobs marked ready per person (from status history), most first. */
export function readyByPerson(history: { toStatus: string; byName: string }[]) {
  const m = new Map<string, number>();
  for (const h of history) if (h.toStatus === 'ready') m.set(h.byName, (m.get(h.byName) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export const daysIn = (r: Range) => Math.round((r.to.getTime() - r.from.getTime()) / DAY);
