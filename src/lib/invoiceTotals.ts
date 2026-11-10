import { sumLines, type Cents, type LineItem } from './money';

export interface TaxSettings {
  vatRegistered: boolean;
  /** Percent, e.g. { vat: 18, sscl: 2.5 }. */
  taxRates?: { vat: number; sscl: number };
}

export interface Totals {
  subtotal: Cents;
  discount: Cents;
  sscl: Cents;
  vat: Cents;
  total: Cents;
}

/**
 * Invoice totals in cents.
 *
 * For VAT-registered shops, SSCL is charged on the value after discount and VAT
 * on the value including SSCL. Confirm this with the shop's accountant or the
 * IRD before going live: the order and rates are set by law and change.
 * Non-registered shops get no tax lines at all.
 */
export function computeTotals(items: LineItem[], discount: Cents, tax: TaxSettings): Totals {
  const subtotal = sumLines(items);
  const d = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const net = subtotal - d;
  const rates = tax.vatRegistered ? tax.taxRates ?? { vat: 0, sscl: 0 } : { vat: 0, sscl: 0 };
  const sscl = Math.round((net * rates.sscl) / 100);
  const vat = Math.round(((net + sscl) * rates.vat) / 100);
  return { subtotal, discount: d, sscl, vat, total: net + sscl + vat };
}

/** Status that matches the money (the security rules check the same). */
export function paymentStatus(total: Cents, paid: Cents): 'unpaid' | 'partial' | 'paid' {
  return total - paid === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
}
