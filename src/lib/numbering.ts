import { doc, runTransaction, type Transaction } from 'firebase/firestore';
import { db } from './firebase';
import { counterId, formatNumber, type NumberKind, type RestartRule } from './numberFormat';

export { counterId, formatNumber, isValidPrefix, type NumberKind, type RestartRule } from './numberFormat';

/**
 * Issue the next number and write the numbered document in ONE transaction,
 * so two staff can never get the same number and a failed save never burns one.
 *
 * Transactions need a connection: callers should block "Create ticket" /
 * "Issue invoice" while offline (see useOnline) rather than queue the write.
 *
 *   const ticketNo = await issueNumbered('ticket', shop.prefixes.ticket, shop.numberRestart, (tx, no) => {
 *     tx.set(doc(collection(db, 'tickets')), { ticketNo: no, ... });
 *   });
 */
export async function issueNumbered<R = undefined>(
  kind: NumberKind,
  prefix: string,
  restart: RestartRule | undefined,
  write: (tx: Transaction, number: string, read: R) => void,
  opts: {
    now?: Date;
    /** Extra reads (e.g. stock levels). Runs before any write, as transactions require; may throw to abort. */
    read?: (tx: Transaction) => Promise<R>;
  } = {},
): Promise<string> {
  const now = opts.now ?? new Date();
  const counterRef = doc(db, 'counters', counterId(restart, now));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const extra = (opts.read ? await opts.read(tx) : undefined) as R;
    const next = ((snap.exists() ? (snap.data()[kind] as number | undefined) : undefined) ?? 0) + 1;
    if (snap.exists()) tx.update(counterRef, { [kind]: next });
    else tx.set(counterRef, { [kind]: next });
    const number = formatNumber(prefix, next, restart, now);
    write(tx, number, extra);
    return number;
  });
}
