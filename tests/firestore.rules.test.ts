// Security rules tests. Run with `npm run test:rules` (starts the Firestore emulator; needs Java 11+).
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'invoices', 'i1'), { invoiceNo: 'INV-2026-0009', status: 'partial', total: 1850000, paid: 600000, balance: 1250000 });
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

describe('numbering', () => {
  it('only allows +1 on one counter', async () => {
    await assertSucceeds(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 6 }));
    await assertFails(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 8 }));
    await assertFails(updateDoc(doc(as('desk'), 'counters', '2026'), { ticket: 7, invoice: 10 }));
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
  it('front desk can take a payment but not change the total', async () => {
    await assertSucceeds(updateDoc(doc(as('desk'), 'invoices', 'i1'), { paid: 1850000, balance: 0, status: 'paid' }));
    await assertFails(updateDoc(doc(as('desk'), 'invoices', 'i1'), { total: 100 }));
  });

  it('only the owner voids, and nobody deletes', async () => {
    await assertFails(updateDoc(doc(as('manager'), 'invoices', 'i1'), { status: 'void', voidReason: 'x' }));
    await assertSucceeds(updateDoc(doc(as('owner'), 'invoices', 'i1'), { status: 'void', voidReason: 'Duplicate' }));
    await assertFails(deleteDoc(doc(as('owner'), 'invoices', 'i1')));
  });

  it('technicians cannot read invoices', async () => {
    await assertFails(getDoc(doc(as('tech'), 'invoices', 'i1')));
  });
});

describe('public status page', () => {
  it('allows reading one job by token but not listing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'publicStatus', 'tok123')));
    await assertFails(getDocs(collection(anon, 'publicStatus')));
  });
});
