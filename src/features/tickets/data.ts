import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Cents } from '../../lib/money';
import { issueNumbered } from '../../lib/numbering';
import type { WithId } from '../../lib/useFirestore';
import {
  CLOSED_STATUSES,
  OPEN_STATUSES,
  type ShopSettings,
  type Ticket,
  type TicketStatus,
} from '../../types';
import { deviceDoc, deviceLabel, type CustomerRow, type DeviceInput } from '../customers/data';
import { isClosed } from './status';

export type TicketRow = WithId<Ticket>;
export interface Me {
  uid: string;
  name: string;
}

const tickets = collection(db, 'tickets');

export const openTicketsQuery = () =>
  query(tickets, where('status', 'in', OPEN_STATUSES), orderBy('updatedAt', 'desc'), limit(300));

export const closedTicketsQuery = (n: number) =>
  query(tickets, where('status', 'in', CLOSED_STATUSES), orderBy('updatedAt', 'desc'), limit(n));

export const deviceTicketsQuery = (deviceId: string) =>
  query(tickets, where('deviceId', '==', deviceId), orderBy('createdAt', 'desc'), limit(10));

export const ticketByNumberQuery = (ticketNo: string) => query(tickets, where('ticketNo', '==', ticketNo), limit(1));

/** 128-bit random token for the public status link (unguessable; see rules). */
export function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function statusUrl(token: string): string {
  return `${window.location.origin}/status/${token}`;
}

export interface NewTicketInput {
  customer: CustomerRow;
  /** An existing device, or the fields for a new one. */
  device: { id: string; type: string; brand: string; model: string; serial?: string } | { new: DeviceInput };
  problem: string;
  accessories: string[];
  condition: string[];
  conditionNotes: string;
  estimate: Cents | null;
  advance: Cents | null;
  dueDate: Date | null;
  assigned: Me | null;
  pin: string;
}

/**
 * Issue the ticket number and write everything for a new job in ONE transaction:
 * counter, (new) device, ticket, first history entry, public status, device PIN.
 * Needs a connection; the caller blocks this while offline.
 */
export async function createTicket(
  input: NewTicketInput,
  shop: Pick<ShopSettings, 'prefixes' | 'numberRestart'>,
  me: Me,
): Promise<{ id: string; ticketNo: string; token: string }> {
  const ticketRef = doc(tickets);
  const token = newToken();
  const isNew = 'new' in input.device;
  const deviceRef = isNew ? doc(collection(db, 'devices')) : doc(db, 'devices', (input.device as { id: string }).id);
  const d = isNew ? (input.device as { new: DeviceInput }).new : (input.device as { type: string; brand: string; model: string; serial?: string });
  const label = deviceLabel(d);
  const pin = input.pin.trim();
  const due = input.dueDate ? Timestamp.fromDate(input.dueDate) : null;

  const ticketNo = await issueNumbered('ticket', shop.prefixes.ticket, shop.numberRestart, (tx, number) => {
    if (isNew) tx.set(deviceRef, deviceDoc(input.customer.id, (input.device as { new: DeviceInput }).new));
    const ticket: Omit<Ticket, 'createdAt' | 'updatedAt'> & Record<string, unknown> = {
      ticketNo: number,
      customerId: input.customer.id,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      deviceId: deviceRef.id,
      deviceLabel: label,
      deviceType: d.type,
      deviceSerial: d.serial?.trim() ?? '',
      problem: input.problem.trim(),
      accessories: input.accessories,
      condition: input.condition,
      conditionNotes: input.conditionNotes.trim(),
      diagnosis: '',
      status: 'received',
      assignedTo: input.assigned?.uid ?? null,
      assignedName: input.assigned?.name ?? null,
      estimate: input.estimate,
      advance: input.advance,
      dueDate: due,
      hasPin: !!pin,
      publicToken: token,
      createdBy: me.uid,
      createdByName: me.name,
    };
    tx.set(ticketRef, { ...ticket, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(doc(collection(ticketRef, 'history')), {
      fromStatus: null,
      toStatus: 'received',
      note: '',
      byUid: me.uid,
      byName: me.name,
      at: serverTimestamp(),
    });
    tx.set(doc(db, 'publicStatus', token), {
      ticketNo: number,
      status: 'received',
      deviceLabel: label,
      dueDate: due,
      updatedAt: serverTimestamp(),
    });
    if (pin) tx.set(doc(deviceRef, 'secret', 'pin'), { pin, ticketId: ticketRef.id });
  });

  return { id: ticketRef.id, ticketNo, token };
}

/**
 * Move a ticket to a new status, with a history entry and the public status.
 * Collected or cancelled jobs lose their stored device PIN.
 * Works offline: the write is queued and the screen updates at once.
 */
export function changeStatus(t: TicketRow, to: TicketStatus, note: string, me: Me): Promise<void> {
  const batch = writeBatch(db);
  const ref = doc(db, 'tickets', t.id);
  const clearPin = isClosed(to) && t.hasPin;
  batch.update(ref, { status: to, updatedAt: serverTimestamp(), ...(clearPin ? { hasPin: false } : {}) });
  batch.set(doc(collection(ref, 'history')), {
    fromStatus: t.status,
    toStatus: to,
    note: note.trim(),
    byUid: me.uid,
    byName: me.name,
    at: serverTimestamp(),
  });
  batch.set(doc(db, 'publicStatus', t.publicToken), { status: to, updatedAt: serverTimestamp() }, { merge: true });
  if (clearPin) batch.delete(doc(db, 'devices', t.deviceId, 'secret', 'pin'));
  return batch.commit();
}

export function addNote(ticketId: string, text: string, me: Me): Promise<void> {
  return setDoc(doc(collection(db, 'tickets', ticketId, 'notes')), {
    text: text.trim(),
    byUid: me.uid,
    byName: me.name,
    at: serverTimestamp(),
  });
}

export function saveDiagnosis(ticketId: string, diagnosis: string): Promise<void> {
  return updateDoc(doc(db, 'tickets', ticketId), { diagnosis: diagnosis.trim(), updatedAt: serverTimestamp() });
}

/** Counter-only edits: estimate, due date, technician. */
export function updateTicket(
  t: TicketRow,
  f: { estimate: Cents | null; dueDate: Date | null; assigned: Me | null },
): Promise<void> {
  const batch = writeBatch(db);
  const due = f.dueDate ? Timestamp.fromDate(f.dueDate) : null;
  batch.update(doc(db, 'tickets', t.id), {
    estimate: f.estimate,
    dueDate: due,
    assignedTo: f.assigned?.uid ?? null,
    assignedName: f.assigned?.name ?? null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'publicStatus', t.publicToken), { dueDate: due, updatedAt: serverTimestamp() }, { merge: true });
  return batch.commit();
}

/** Remove the stored device PIN by hand (e.g. customer asks). */
export function clearPin(t: TicketRow): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'devices', t.deviceId, 'secret', 'pin'));
  batch.update(doc(db, 'tickets', t.id), { hasPin: false, updatedAt: serverTimestamp() });
  return batch.commit();
}

