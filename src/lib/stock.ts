import type { Cents } from './money';

/** Units needed per stock item across invoice lines (the same part can appear twice). */
export function stockNeeds(items: { inventoryId?: string; qty: number }[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const it of items) if (it.inventoryId) need.set(it.inventoryId, (need.get(it.inventoryId) ?? 0) + it.qty);
  return need;
}

/** The `low` flag the security rules expect. */
export const isLow = (qty: number, lowStockAt: number) => qty <= lowStockAt;

/** Stock change for an adjustment: received/damaged move by `n`, a count sets the level to `n`. */
export function adjustmentDelta(reason: 'received' | 'damaged' | 'count', n: number, current: number): number {
  return reason === 'received' ? n : reason === 'damaged' ? -n : n - current;
}

export function margin(cost: Cents, price: Cents): { amount: Cents; percent: number } {
  const amount = price - cost;
  return { amount, percent: price > 0 ? Math.round((amount / price) * 100) : 0 };
}
