// Seeds the local emulators with an owner account and shop settings.
// Start the emulators first (`npm run emulators`), then run `npm run seed`.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const projectId = 'demo-fixbench';
initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

const STAFF = [
  { email: 'owner@demo.test', name: 'Anura Perera', role: 'owner' },
  { email: 'manager@demo.test', name: 'Ruwini Mendis', role: 'manager' },
  { email: 'desk@demo.test', name: 'Nimal Perera', role: 'frontdesk' },
  { email: 'tech@demo.test', name: 'Sahan Kumara', role: 'technician' },
];
const PASSWORD = 'password123';

async function upsertUser({ email, name, role }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: PASSWORD, displayName: name });
  }
  await db.doc(`users/${user.uid}`).set({ name, email, role, active: true });
  return user;
}

for (const s of STAFF) await upsertUser(s);

const brandColor = '#0F766E';
await db.doc('settings/shop').set({
  name: 'Demo Repair Shop',
  phone: '011 258 4410',
  whatsapp: '077 258 4410',
  address: { street: '118 Galle Road', city: 'Colombo 03' },
  hours: { weekdays: '9:00 am – 6:30 pm', saturday: '9:00 am – 2:00 pm', sunday: 'Closed' },
  brandColor,
  currency: 'LKR',
  vatRegistered: false,
  prefixes: { ticket: 'T', quote: 'Q', invoice: 'INV' },
  terms: 'Parts carry a 3-month warranty. Devices not collected within 60 days of notification may be disposed of.',
  plan: 'spark',
  setupComplete: false,
  updatedAt: FieldValue.serverTimestamp(),
});
await db.doc('settings/public').set({
  name: 'Demo Repair Shop',
  phone: '011 258 4410',
  whatsapp: '077 258 4410',
  hours: { weekdays: '9:00 am – 6:30 pm', saturday: '9:00 am – 2:00 pm', sunday: 'Closed' },
  brandColor,
});

console.log('Seeded demo-fixbench.');
console.log(`Sign in at http://localhost:5173 with any of these (password: ${PASSWORD}):`);
for (const s of STAFF) console.log(`  ${s.role.padEnd(10)} ${s.email}`);
