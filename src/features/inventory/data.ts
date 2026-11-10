import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Cents } from '../../lib/money';
import { searchTokens } from '../../lib/search';
import { adjustmentDelta, isLow } from '../../lib/stock';
import type { WithId } from '../../lib/useFirestore';
import type { InventoryItem, StockMovement } from '../../types';
import type { Me } from '../tickets/data';

export type ItemRow = WithId<InventoryItem>;
export type MovementRow = WithId<StockMovement>;

const inventory = collection(db, 'inventory');

/** Whole catalogue (a repair shop has hundreds of items, not thousands). */
export const inventoryQuery = () => query(inventory, orderBy('name'), limit(2000));
export const lowStockQuery = () => query(inventory, where('low', '==', true), where('active', '==', true), limit(100));
export const movementsQuery = (id: string) => query(collection(db, 'inventory', id, 'movements'), orderBy('at', 'desc'), limit(50));

export interface ItemInput {
  sku: string;
  name: string;
  category: string;
  cost: Cents;
  price: Cents;
  lowStockAt: number;
}

const details = (f: ItemInput) => ({
  sku: f.sku.trim().toUpperCase(),
  name: f.name.trim(),
  category: f.category,
  cost: f.cost,
  price: f.price,
  lowStockAt: f.lowStockAt,
  searchTokens: searchTokens(f.name, f.sku),
});

/** New item; opening stock is recorded as its first movement. */
export async function createItem(f: ItemInput, openingQty: number, me: Me): Promise<string> {
  const ref = doc(inventory);
  const batch = writeBatch(db);
  const mref = openingQty > 0 ? doc(collection(ref, 'movements')) : null;
  batch.set(ref, {
    ...details(f),
    qty: openingQty,
    low: isLow(openingQty, f.lowStockAt),
    active: true,
    ...(mref ? { lastMovementId: mref.id } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (mref) {
    batch.set(mref, { delta: openingQty, qtyAfter: openingQty, reason: 'received', note: 'Opening stock', byUid: me.uid, byName: me.name, at: serverTimestamp() });
  }
  await batch.commit();
  return ref.id;
}

/** Edit details. A transaction reads qty so the low flag stays right. */
export async function updateItem(id: string, f: ItemInput): Promise<void> {
  const ref = doc(db, 'inventory', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const qty = (snap.data() as InventoryItem).qty;
    tx.update(ref, { ...details(f), low: isLow(qty, f.lowStockAt), updatedAt: serverTimestamp() });
  });
}

export function setActive(id: string, active: boolean): Promise<void> {
  return updateDoc(doc(db, 'inventory', id), { active, updatedAt: serverTimestamp() });
}

/** Managers: received, damaged or a stock count. Never below zero. */
export async function adjustStock(
  id: string,
  reason: 'received' | 'damaged' | 'count',
  n: number,
  note: string,
  me: Me,
): Promise<void> {
  const ref = doc(db, 'inventory', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const item = snap.data() as InventoryItem;
    const delta = adjustmentDelta(reason, n, item.qty);
    const qty = item.qty + delta;
    if (qty < 0) throw new Error(`Only ${item.qty} in stock.`);
    if (delta === 0) return;
    const mref = doc(collection(ref, 'movements'));
    tx.set(mref, { delta, qtyAfter: qty, reason, note: note.trim(), byUid: me.uid, byName: me.name, at: serverTimestamp() });
    tx.update(ref, { qty, low: isLow(qty, item.lowStockAt), lastMovementId: mref.id, updatedAt: serverTimestamp() });
  });
}

export const REASON_LABEL: Record<StockMovement['reason'], string> = {
  received: 'Received',
  damaged: 'Damaged or lost',
  count: 'Stock count',
  sold: 'Sold',
  returned: 'Returned (invoice voided)',
};
