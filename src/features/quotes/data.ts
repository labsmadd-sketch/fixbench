import { collection, doc, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { sumLines, type Cents } from '../../lib/money';
import { issueNumbered } from '../../lib/numbering';
import type { WithId } from '../../lib/useFirestore';
import type { ApprovedVia, InvoiceItem, Quote, QuoteItem, QuoteStatus, ShopSettings } from '../../types';
import { addStatusChange, saveDiagnosis, type Me, type TicketRow } from '../tickets/data';

export type QuoteRow = WithId<Quote>;

const quotes = collection(db, 'quotes');

export const quotesQuery = (status: QuoteStatus | 'all', n: number) =>
  status === 'all'
    ? query(quotes, orderBy('createdAt', 'desc'), limit(n))
    : query(quotes, where('status', '==', status), orderBy('createdAt', 'desc'), limit(n));

export const ticketQuotesQuery = (ticketId: string) =>
  query(quotes, where('ticketId', '==', ticketId), orderBy('createdAt', 'desc'), limit(10));

export function quoteTotals(items: QuoteItem[]): { recommended: Cents; optional: Cents } {
  return {
    recommended: sumLines(items.filter((i) => !i.optional)),
    optional: sumLines(items.filter((i) => i.optional)),
  };
}

/** The lines an approved quote puts on the invoice. */
export function approvedLines(q: Quote): InvoiceItem[] {
  return q.items
    .filter((i) => !i.optional || q.withOptional)
    .map(({ description, kind, qty, unitPrice, inventoryId }) => ({ description, kind, qty, unitPrice, ...(inventoryId ? { inventoryId } : {}) }));
}

export interface QuoteInput {
  diagnosis: string;
  items: QuoteItem[];
  validUntil: Date;
}

/** New quote for a job (any staff member). The number comes from a transaction. */
export async function createQuote(t: TicketRow, f: QuoteInput, shop: ShopSettings, me: Me): Promise<string> {
  const ref = doc(quotes);
  const totals = quoteTotals(f.items);
  await issueNumbered('quote', shop.prefixes.quote, shop.numberRestart, (tx, number) => {
    tx.set(ref, {
      quoteNo: number,
      ticketId: t.id,
      ticketNo: t.ticketNo,
      customerId: t.customerId,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      deviceLabel: t.deviceLabel,
      diagnosis: f.diagnosis.trim(),
      items: f.items,
      recommendedTotal: totals.recommended,
      optionalTotal: totals.optional,
      validUntil: Timestamp.fromDate(f.validUntil),
      status: 'draft',
      createdBy: me.uid,
      createdByName: me.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  // Keep the job's diagnosis in step with what the customer is told.
  if (f.diagnosis.trim() && f.diagnosis.trim() !== (t.diagnosis ?? '').trim()) {
    await saveDiagnosis(t.id, f.diagnosis).catch(() => undefined);
  }
  return ref.id;
}

export function updateDraft(id: string, f: QuoteInput): Promise<void> {
  const totals = quoteTotals(f.items);
  return updateDoc(doc(db, 'quotes', id), {
    diagnosis: f.diagnosis.trim(),
    items: f.items,
    recommendedTotal: totals.recommended,
    optionalTotal: totals.optional,
    validUntil: Timestamp.fromDate(f.validUntil),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark as sent; an open job moves to "Awaiting approval". One batch, so the
 * quote and the job change together (no window where they disagree).
 */
export function markSent(q: QuoteRow, t: TicketRow | null, me: Me): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'quotes', q.id), { status: 'sent', sentAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (t && ['received', 'diagnosing'].includes(t.status)) addStatusChange(batch, t, 'awaiting_approval', `Quote ${q.quoteNo} sent`, me);
  return batch.commit();
}

const VIA: Record<ApprovedVia, string> = { whatsapp: 'WhatsApp reply', call: 'phone call', in_person: 'in person' };

/**
 * Record the customer's answer, in one batch with its effect on the job:
 * approving moves a job that is still before repair to "Awaiting parts";
 * declining leaves a note for the team.
 */
export function recordAnswer(
  q: QuoteRow,
  t: TicketRow | null,
  answer: 'approved' | 'approved_optional' | 'declined',
  via: ApprovedVia,
  me: Me,
): Promise<void> {
  const approved = answer !== 'declined';
  const batch = writeBatch(db);
  batch.update(doc(db, 'quotes', q.id), {
    status: approved ? 'approved' : 'declined',
    withOptional: answer === 'approved_optional',
    approvedVia: via,
    decidedAt: serverTimestamp(),
    decidedBy: me.name,
    updatedAt: serverTimestamp(),
  });
  if (t && approved && ['received', 'diagnosing', 'awaiting_approval'].includes(t.status)) {
    addStatusChange(batch, t, 'awaiting_parts', `Quote ${q.quoteNo} approved by ${VIA[via]}${answer === 'approved_optional' ? ' (with optional items)' : ''}`, me);
  } else if (t && !approved) {
    batch.set(doc(collection(db, 'tickets', t.id, 'notes')), {
      text: `Customer declined quote ${q.quoteNo} (${VIA[via]}).`,
      byUid: me.uid,
      byName: me.name,
      at: serverTimestamp(),
    });
  }
  return batch.commit();
}

export function quoteMessage(q: Quote, shopName: string, fmt: (c: Cents) => string): string {
  const first = q.customerName.split(/[\s(]/)[0];
  const parts = q.items.filter((i) => !i.optional).map((i) => i.description);
  const lines = [
    `Hi ${first}, your ${q.deviceLabel} (${q.ticketNo}) needs: ${parts.join(', ')}.`,
    `Total ${fmt(q.recommendedTotal)}.`,
  ];
  if (q.optionalTotal > 0) lines.push(`Optional: ${q.items.filter((i) => i.optional).map((i) => i.description).join(', ')} +${fmt(q.optionalTotal)}.`);
  lines.push(`Reply YES to go ahead. — ${shopName}`);
  return lines.join(' ');
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; bg: string; fg: string; dot: string }> = {
  draft: { label: 'Draft', bg: '#EEF0F3', fg: '#374151', dot: '#6B7280' },
  sent: { label: 'Waiting for customer', bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  approved: { label: 'Approved', bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  declined: { label: 'Declined', bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
};
