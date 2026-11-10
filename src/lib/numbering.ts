import { doc, runTransaction, type Transaction } from 'firebase/firestore';
import { db } from './firebase';

export type NumberKind = 'ticket' | 'quote' | 'invoice';

export function formatNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Issue the next number and write the numbered document in ONE transaction,
 * so two staff can never get the same number and a failed save never burns one.
 *
 * Transactions need a connection: callers should block "Create ticket" /
 * "Issue invoice" while offline (see useOnline) rather than queue the write.
 *
 *   const ticketNo = await issueNumbered('ticket', 'T', (tx, no) => {
 *     tx.set(doc(collection(db, 'tickets')), { ticketNo: no, ... });
 *   });
 */
export async function issueNumbered(
  kind: NumberKind,
  prefix: string,
  write: (tx: Transaction, number: string) => void,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const counterRef = doc(db, 'counters', String(year));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = ((snap.exists() ? (snap.data()[kind] as number | undefined) : undefined) ?? 0) + 1;
    if (snap.exists()) tx.update(counterRef, { [kind]: next });
    else tx.set(counterRef, { [kind]: next });
    const number = formatNumber(prefix, year, next);
    write(tx, number);
    return number;
  });
}
