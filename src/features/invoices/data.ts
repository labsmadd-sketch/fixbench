import {
  collection,
  collectionGroup,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { computeTotals, paymentStatus } from '../../lib/invoiceTotals';
import type { Cents } from '../../lib/money';
import { issueNumbered } from '../../lib/numbering';
import type { WithId } from '../../lib/useFirestore';
import type { Invoice, InvoiceItem, InvoiceStatus, Payment, PaymentMethod, ShopSettings } from '../../types';
import type { CustomerRow } from '../customers/data';
import type { Me, TicketRow } from '../tickets/data';

export type InvoiceRow = WithId<Invoice>;
export type PaymentRow = WithId<Payment>;

const invoices = collection(db, 'invoices');

export const invoicesQuery = (status: InvoiceStatus | 'all' | 'open', n: number) =>
  status === 'all'
    ? query(invoices, orderBy('issuedAt', 'desc'), limit(n))
    : status === 'open'
      ? query(invoices, where('status', 'in', ['unpaid', 'partial']), orderBy('issuedAt', 'desc'), limit(n))
      : query(invoices, where('status', '==', status), orderBy('issuedAt', 'desc'), limit(n));

export const customerInvoicesQuery = (customerId: string) =>
  query(invoices, where('customerId', '==', customerId), orderBy('issuedAt', 'desc'), limit(50));

export const paymentsQuery = (invoiceId: string) => query(collection(db, 'invoices', invoiceId, 'payments'), orderBy('at', 'asc'));

/** Every payment taken since midnight, across invoices (dashboard "Taken today"). */
export function paymentsSinceQuery(since: Date) {
  return query(collectionGroup(db, 'payments'), where('at', '>=', Timestamp.fromDate(since)), orderBy('at', 'desc'), limit(500));
}

export interface NewInvoiceInput {
  customer: CustomerRow;
  ticket: TicketRow | null;
  items: InvoiceItem[];
  discount: Cents;
  /** Money taken at intake, recorded as the first payment. */
  advance: { amount: Cents; method: PaymentMethod } | null;
}

/**
 * Issue an invoice in ONE transaction: next number, the invoice, the advance
 * as its first payment, and the link from the ticket. Needs a connection.
 */
export async function issueInvoice(
  input: NewInvoiceInput,
  shop: ShopSettings,
  me: Me,
): Promise<{ id: string; invoiceNo: string }> {
  const ref = doc(invoices);
  const totals = computeTotals(input.items, input.discount, shop);
  const advance = input.advance && input.advance.amount > 0 ? input.advance : null;
  if (advance && advance.amount > totals.total) throw new Error('The advance is more than the invoice total.');
  const paid = advance?.amount ?? 0;
  const paymentRef = advance ? doc(collection(ref, 'payments')) : null;

  const invoiceNo = await issueNumbered('invoice', shop.prefixes.invoice, shop.numberRestart, (tx, number) => {
    const t = input.ticket;
    const c = input.customer;
    tx.set(ref, {
      invoiceNo: number,
      type: t ? 'repair' : 'sale',
      ticketId: t?.id ?? null,
      ticketNo: t?.ticketNo ?? null,
      deviceLabel: t ? `${t.deviceLabel}${t.deviceSerial ? ` S/N ${t.deviceSerial}` : ''}` : null,
      customerId: c.id,
      customerName: c.type === 'business' && c.companyName ? `${c.companyName} (${c.name})` : c.name,
      customerPhone: c.phone,
      customerEmail: c.email ?? '',
      customerTin: c.tin ?? '',
      items: input.items,
      ...totals,
      tax: totals.sscl + totals.vat,
      vatRegistered: shop.vatRegistered,
      taxRates: shop.vatRegistered ? shop.taxRates ?? null : null,
      paid,
      balance: totals.total - paid,
      status: paymentStatus(totals.total, paid),
      ...(paymentRef ? { lastPaymentId: paymentRef.id } : {}),
      issuedBy: me.uid,
      issuedByName: me.name,
      issuedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (advance && paymentRef) {
      tx.set(paymentRef, {
        amount: advance.amount,
        method: advance.method,
        reference: '',
        note: 'advance',
        byUid: me.uid,
        byName: me.name,
        at: t?.createdAt ?? serverTimestamp(),
      });
    }
    if (t) tx.update(doc(db, 'tickets', t.id), { invoiceId: ref.id, invoiceNo: number, updatedAt: serverTimestamp() });
  });

  return { id: ref.id, invoiceNo };
}

/**
 * Record a payment. A transaction reads the latest balance first, so two
 * people taking money at the same time cannot overwrite each other.
 */
export async function recordPayment(
  invoiceId: string,
  p: { amount: Cents; method: PaymentMethod; reference: string },
  me: Me,
): Promise<void> {
  const ref = doc(db, 'invoices', invoiceId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This invoice no longer exists.');
    const inv = snap.data() as Invoice;
    if (inv.status === 'void') throw new Error('This invoice has been voided.');
    if (p.amount <= 0) throw new Error('Enter an amount above zero.');
    if (p.amount > inv.balance) throw new Error('That is more than the balance due.');
    const payRef = doc(collection(ref, 'payments'));
    const paid = inv.paid + p.amount;
    tx.set(payRef, {
      amount: p.amount,
      method: p.method,
      reference: p.reference.trim(),
      note: '',
      byUid: me.uid,
      byName: me.name,
      at: serverTimestamp(),
    });
    tx.update(ref, {
      paid,
      balance: inv.total - paid,
      status: paymentStatus(inv.total, paid),
      lastPaymentId: payRef.id,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Owner only (rules enforce it). The number stays used; nothing is deleted. */
export function voidInvoice(invoiceId: string, reason: string, me: Me): Promise<void> {
  return updateDoc(doc(db, 'invoices', invoiceId), {
    status: 'void',
    voidReason: reason.trim(),
    voidedAt: serverTimestamp(),
    voidedBy: me.name,
    updatedAt: serverTimestamp(),
  });
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; bg: string; fg: string; dot: string }> = {
  unpaid: { label: 'Unpaid', bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
  partial: { label: 'Partly paid', bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  paid: { label: 'Paid', bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  void: { label: 'Void', bg: '#F1F5F9', fg: '#334155', dot: '#64748B' },
};

/** Short summary for WhatsApp or email. */
export function invoiceMessage(inv: Invoice, shopName: string, fmt: (c: Cents) => string): string {
  const first = inv.customerName.split(/[\s(]/)[0];
  const lines = [
    `Hello ${first}, this is ${shopName}.`,
    `Invoice ${inv.invoiceNo}${inv.ticketNo ? ` for job ${inv.ticketNo}` : ''}: total ${fmt(inv.total)}.`,
  ];
  if (inv.paid > 0) lines.push(`Paid ${fmt(inv.paid)}.`);
  lines.push(inv.balance > 0 ? `Balance due ${fmt(inv.balance)}.` : 'Paid in full. Thank you!');
  return lines.join(' ');
}
