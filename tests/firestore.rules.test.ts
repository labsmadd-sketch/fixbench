// Security rules tests. Run with `npm run test:rules` (starts the Firestore emulator; needs Java 11+).
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, collectionGroup, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const STAFF = {
  owner: { role: 'owner', active: true },
  manager: { role: 'manager', active: true },
  desk: { role: 'frontdesk', active: true },
  tech: { role: 'technician', active: true },
  gone: { role: 'manager', active: false },
} as const;

const as = (uid: keyof typeof STAFF | 'stranger') => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fixbench-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, p] of Object.entries(STAFF)) {
      await setDoc(doc(db, 'users', uid), { name: uid, email: `${uid}@test`, ...p });
    }
    await setDoc(doc(db, 'counters', '2026'), { ticket: 5, quote: 2, invoice: 9 });
    await setDoc(doc(db, 'tickets', 't1'), { ticketNo: 'T-2026-0005', status: 'in_repair', assignedTo: 'tech' });
    await setDoc(doc(db, 'tickets', 't2'), { ticketNo: 'T-2026-0004', status: 'received', assignedTo: 'someone-else' });
    await setDoc(doc(db, 'devices', 'd1', 'secret', 'pin'), { pin: '483920', ticketId: 't1' });
    await setDoc(doc(db, 'devices', 'd2', 'secret', 'pin'), { pin: '111111', ticketId: 't2' });
    await setDoc(doc(db, 'invoices', 'i1'), { invoiceNo: 'INV-2026-0009', status: 'partial', total: 1850000, paid: 600000, balance: 1250000, lastPaymentId: 'p0' });
    await setDoc(doc(db, 'invoices', 'i1', 'payments', 'p0'), { amount: 600000, method: 'cash', byUid: 'desk' });
    await setDoc(doc(db, 'publicStatus', 'tok123'), { ticketNo: 'T-2026-0005', status: 'ready' });
  });
});

describe('access', () => {
  it('blocks strangers and turned-off staff', async () => {
    await assertFails(getDoc(doc(as('stranger'), 'tickets', 't1')));
    await assertFails(getDoc(doc(as('gone'), 'tickets', 't1')));
    await assertSucceeds(getDoc(doc(as('desk'), 'tickets', 't1')));
  });

  it('lets anyone read their own staff record, even when turned off', async () => {
    await assertSucceeds(getDoc(doc(as('gone'), 'users', 'gone')));
  });
});

describe('first sign-in password change', () => {
  it('lets staff clear only their own mustChangePassword flag', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'users', 'desk'), { mustChangePassword: true }),
    );
    await assertFails(updateDoc(doc(as('desk'), 'users', 'desk'), { mustChangePassword: false, role: 'owner' }));
    await assertFails(updateDoc(doc(as('desk'), 'users', 'tech'), { mustChangePassword: false }));
    await assertFails(updateDoc(doc(as('desk'), 'users', 'desk'), { mustChangePassword: true, active: true }));
    await assertSucceeds(updateDoc(doc(as('desk'), 'users', 'desk'), { mustChangePassword: false }));
  });

  it('lets only the owner manage staff records', async () => {
    await assertFails(setDoc(doc(as('manager'), 'users', 'new'), { name: 'x', email: 'x@test', role: 'owner', active: true }));
    await assertSucceeds(
      setDoc(doc(as('owner'), 'users', 'new'), { name: 'x', email: 'x@test', role: 'frontdesk', active: true, mustChangePassword: true }),
    );
  });
});

describe('numbering', () => {
  it('only allows +1 on one counter', async () => {
    await assertSucceeds(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 6 }));
    await assertFails(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 8 }));
    await assertFails(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 7, invoice: 10 }));
  });

  it('lets only the owner start a new counter above 1, and only once', async () => {
    await assertFails(setDoc(doc(as('desk'), 'counters', 'all'), { invoice: 500 }));
    await assertSucceeds(setDoc(doc(as('desk'), 'counters', '2027'), { ticket: 1 }));
    await assertFails(setDoc(doc(as('owner'), 'counters', 'all'), { invoice: -1 }));
    await assertFails(setDoc(doc(as('owner'), 'counters', 'all'), { invoice: 500, extra: 1 }));
    await assertSucceeds(setDoc(doc(as('owner'), 'counters', 'all'), { invoice: 500 }));
    // Existing counters can still only go up by one, even for the owner.
    await assertFails(setDoc(doc(as('owner'), 'counters', '2026'), { ticket: 5, quote: 2, invoice: 900 }));
  });

  it('technicians can number quotes but not invoices', async () => {
    await assertSucceeds(updateDoc(doc(as('tech'), 'counters', '2026'), { quote: 3 }));
    await assertFails(updateDoc(doc(as('tech'), 'counters', '2026'), { invoice: 10 }));
  });
});

describe('tickets', () => {
  it('technicians update status only on their own jobs', async () => {
    await assertSucceeds(updateDoc(doc(as('tech'), 'tickets', 't1'), { status: 'ready' }));
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't1'), { assignedTo: 'tech2' }));
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't2'), { status: 'ready' }));
  });

  it('technicians cannot hand over or cancel; the counter can', async () => {
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't1'), { status: 'collected' }));
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't1'), { status: 'cancelled' }));
    await assertSucceeds(updateDoc(doc(as('desk'), 'tickets', 't1'), { status: 'collected' }));
    // …and a closed job stays closed for the technician.
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't1'), { status: 'in_repair' }));
  });

  it('nobody changes a ticket number', async () => {
    await assertFails(updateDoc(doc(as('owner'), 'tickets', 't1'), { ticketNo: 'T-2026-9999' }));
    await assertSucceeds(updateDoc(doc(as('desk'), 'tickets', 't1'), { problem: 'No power' }));
  });

  it('history and notes are append-only and signed by the writer', async () => {
    await assertSucceeds(setDoc(doc(as('tech'), 'tickets', 't1', 'notes', 'n1'), { text: 'Reflowed', byUid: 'tech' }));
    await assertFails(setDoc(doc(as('tech'), 'tickets', 't1', 'notes', 'n2'), { text: 'Fake', byUid: 'desk' }));
    await assertFails(updateDoc(doc(as('tech'), 'tickets', 't1', 'notes', 'n1'), { text: 'Edited' }));
    await assertFails(deleteDoc(doc(as('owner'), 'tickets', 't1', 'notes', 'n1')));
    await assertSucceeds(setDoc(doc(as('desk'), 'tickets', 't1', 'history', 'h1'), { toStatus: 'ready', byUid: 'desk' }));
  });
});

describe('customers', () => {
  it('front desk adds and edits; technicians only read; only the owner deletes', async () => {
    await assertSucceeds(setDoc(doc(as('desk'), 'customers', 'c1'), { name: 'Kasun', phoneKey: '0771234567' }));
    await assertSucceeds(getDoc(doc(as('tech'), 'customers', 'c1')));
    await assertFails(updateDoc(doc(as('tech'), 'customers', 'c1'), { name: 'X' }));
    await assertFails(deleteDoc(doc(as('manager'), 'customers', 'c1')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'customers', 'c1')));
  });
});

describe('device passwords', () => {
  it('are readable by managers and the assigned technician only', async () => {
    await assertSucceeds(getDoc(doc(as('manager'), 'devices', 'd1', 'secret', 'pin')));
    await assertSucceeds(getDoc(doc(as('tech'), 'devices', 'd1', 'secret', 'pin')));
    await assertFails(getDoc(doc(as('tech'), 'devices', 'd2', 'secret', 'pin')));
    await assertFails(getDoc(doc(as('desk'), 'devices', 'd1', 'secret', 'pin')));
  });
});

describe('invoices', () => {
  const pay = (who: keyof typeof STAFF, pid: string, amount: number, inv: Record<string, unknown>) => {
    const db = as(who);
    const batch = writeBatch(db);
    batch.set(doc(db, 'invoices', 'i1', 'payments', pid), { amount, method: 'cash', byUid: who });
    batch.update(doc(db, 'invoices', 'i1'), { ...inv, lastPaymentId: pid });
    return batch.commit();
  };

  it('a payment raises paid by exactly its amount, with a matching balance and status', async () => {
    await assertFails(pay('desk', 'p1', 1000, { paid: 1850000, balance: 0, status: 'paid' }));
    await assertFails(pay('desk', 'p1', 500000, { paid: 1100000, balance: 750000, status: 'paid' }));
    await assertFails(pay('desk', 'p1', 2000000, { paid: 2600000, balance: -750000, status: 'paid' }));
    await assertSucceeds(pay('desk', 'p1', 500000, { paid: 1100000, balance: 750000, status: 'partial' }));
    await assertSucceeds(pay('desk', 'p2', 750000, { paid: 1850000, balance: 0, status: 'paid' }));
  });

  it('payments and invoice updates only happen together', async () => {
    await assertFails(setDoc(doc(as('desk'), 'invoices', 'i1', 'payments', 'lonely'), { amount: 100, byUid: 'desk' }));
    await assertFails(updateDoc(doc(as('desk'), 'invoices', 'i1'), { paid: 1850000, balance: 0, status: 'paid' }));
    await assertFails(updateDoc(doc(as('desk'), 'invoices', 'i1'), { total: 100 }));
    await assertFails(pay('tech', 'p1', 500000, { paid: 1100000, balance: 750000, status: 'partial' }));
  });

  it('a new invoice may include its advance payment', async () => {
    const db = as('desk');
    const ok = writeBatch(db);
    ok.set(doc(db, 'invoices', 'i2'), { invoiceNo: 'INV-2026-0010', total: 1000000, paid: 300000, balance: 700000, status: 'partial', lastPaymentId: 'adv' });
    ok.set(doc(db, 'invoices', 'i2', 'payments', 'adv'), { amount: 300000, method: 'cash', byUid: 'desk' });
    await assertSucceeds(ok.commit());

    const bad = writeBatch(db);
    bad.set(doc(db, 'invoices', 'i3'), { invoiceNo: 'INV-2026-0011', total: 1000000, paid: 300000, balance: 700000, status: 'partial', lastPaymentId: 'adv' });
    bad.set(doc(db, 'invoices', 'i3', 'payments', 'adv'), { amount: 100, method: 'cash', byUid: 'desk' });
    await assertFails(bad.commit());
    await assertSucceeds(setDoc(doc(db, 'invoices', 'i4'), { invoiceNo: 'INV-2026-0012', total: 500000, paid: 0, balance: 500000, status: 'unpaid' }));
    await assertFails(setDoc(doc(db, 'invoices', 'i5'), { invoiceNo: 'INV-2026-0013', total: 500000, paid: 0, balance: 500000, status: 'paid' }));
  });

  it('managers correct totals but never what was paid', async () => {
    await assertSucceeds(updateDoc(doc(as('manager'), 'invoices', 'i1'), { total: 1600000, balance: 1000000 }));
    await assertFails(updateDoc(doc(as('manager'), 'invoices', 'i1'), { paid: 0, balance: 1600000, status: 'unpaid' }));
    await assertFails(updateDoc(doc(as('manager'), 'invoices', 'i1'), { invoiceNo: 'INV-2026-0099' }));
    await assertFails(updateDoc(doc(as('desk'), 'invoices', 'i1'), { total: 1600000, balance: 1000000 }));
  });

  it('only the owner voids, a void is final, and nobody deletes', async () => {
    await assertFails(updateDoc(doc(as('manager'), 'invoices', 'i1'), { status: 'void', voidReason: 'x' }));
    await assertSucceeds(updateDoc(doc(as('owner'), 'invoices', 'i1'), { status: 'void', voidReason: 'Duplicate' }));
    await assertFails(pay('desk', 'p1', 500000, { paid: 1100000, balance: 750000, status: 'partial' }));
    await assertFails(updateDoc(doc(as('owner'), 'invoices', 'i1'), { status: 'partial' }));
    await assertFails(deleteDoc(doc(as('owner'), 'invoices', 'i1')));
  });

  it('technicians cannot read invoices or payments', async () => {
    await assertFails(getDoc(doc(as('tech'), 'invoices', 'i1')));
    await assertFails(getDocs(collectionGroup(as('tech'), 'payments')));
    await assertSucceeds(getDocs(collectionGroup(as('desk'), 'payments')));
  });
});

describe('public status page', () => {
  it('allows reading one job by token but not listing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'publicStatus', 'tok123')));
    await assertFails(getDocs(collection(anon, 'publicStatus')));
  });
});
