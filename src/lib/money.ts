/**
 * Money is stored as integers in cents (LKR × 100) to avoid rounding errors.
 * Never store or add floating-point rupee amounts.
 */
export type Cents = number;

const lkr = new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1850000 → "18,500.00" */
export function formatAmount(cents: Cents): string {
  return lkr.format(cents / 100);
}

/** 1850000 → "LKR 18,500.00" */
export function formatLKR(cents: Cents): string {
  return `LKR ${formatAmount(cents)}`;
}

/** "18,500.50" → 1850050. Returns null for anything that is not a valid amount. */
export function parseToCents(input: string): Cents | null {
  const clean = input.replace(/[,\s]|LKR|Rs\.?/gi, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return clean.startsWith('-') ? -cents : cents;
}

export interface LineItem {
  qty: number;
  unitPrice: Cents;
}

export function lineTotal(item: LineItem): Cents {
  return Math.round(item.qty * item.unitPrice);
}

export function sumLines(items: LineItem[]): Cents {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
