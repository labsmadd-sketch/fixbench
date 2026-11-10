// Seeds the local emulators with staff, shop settings and demo jobs.
// Start the emulators first (`npm run emulators`), then run `npm run seed`.
// `npm run seed -- --fresh-setup` leaves setup unfinished so the owner sees the wizard.
import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const FRESH_SETUP = process.argv.includes('--fresh-setup');
// `--reset` first deletes ALL Firestore data in the emulator (never touches a real project).
const RESET = process.argv.includes('--reset');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const projectId = 'demo-fixbench';
if (RESET) {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Could not clear the Firestore emulator (${res.status}). Is it running?`);
  console.log('Cleared all Firestore data in the emulator.');
}
initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

const STAFF = [
  { email: 'owner@demo.test', name: 'Anura Perera', role: 'owner' },
  { email: 'manager@demo.test', name: 'Ruwini Mendis', role: 'manager' },
  { email: 'desk@demo.test', name: 'Nimal Perera', role: 'frontdesk' },
  { email: 'tech@demo.test', name: 'Sahan Kumara', role: 'technician' },
  { email: 'tech2@demo.test', name: 'Ishara Silva', role: 'technician' },
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

const uids = [];
for (const s of STAFF) uids.push((await upsertUser(s)).uid);

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
  numberRestart: 'yearly',
  plan: 'spark',
  // `npm run seed -- --fresh-setup` sends the owner through the setup wizard.
  setupComplete: !FRESH_SETUP,
  updatedAt: FieldValue.serverTimestamp(),
});
await db.doc('settings/public').set({
  name: 'Demo Repair Shop',
  phone: '011 258 4410',
  whatsapp: '077 258 4410',
  hours: { weekdays: '9:00 am – 6:30 pm', saturday: '9:00 am – 2:00 pm', sunday: 'Closed' },
  brandColor,
});

// ---------- demo customers, devices and tickets ----------
// Fixed ids, so running the seed again resets them instead of adding copies.

function phoneKey(input) {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('94') && d.length === 11) d = d.slice(2);
  if (d.length === 9) d = '0' + d;
  return d;
}
function searchTokens(...texts) {
  const out = new Set();
  for (const w of texts.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    for (let i = Math.min(2, w.length); i <= Math.min(w.length, 12); i++) out.add(w.slice(0, i));
  }
  return [...out];
}
const DAY = 86_400_000;
const at = (days, hour = 10, min = 0) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, min, 0, 0);
  return Timestamp.fromDate(d);
};
const token = (id) => createHash('md5').update(`fixbench-demo-${id}`).digest('hex');

const CUSTOMERS = [
  ['c-kasun', 'Kasun Fernando', '077 123 4567', 'Nugegoda', 'kasun.f@example.com'],
  ['c-dilani', 'Dilani Perera', '071 555 2390', 'Dehiwala'],
  ['c-chamara', 'Chamara Wijesinghe', '077 410 8836', 'Maharagama'],
  ['c-ayesha', 'Ayesha Nizar', '075 663 1180', 'Colombo 06'],
  ['c-tharindu', 'Tharindu Silva', '070 312 7745', 'Kottawa'],
  ['c-ruwan', 'Ruwan Bandara', '072 909 4410', 'Kandy'],
  ['c-shanika', 'Shanika Jayawardena', '078 246 9013', 'Moratuwa'],
];
for (const [id, name, phone, city, email = ''] of CUSTOMERS) {
  await db.doc(`customers/${id}`).set({
    type: 'individual', name, companyName: '', phone, phoneKey: phoneKey(phone), secondPhone: '', secondPhoneKey: '',
    email, address: { street: '', city }, tin: '', preferredContact: 'whatsapp', whatsappConsent: true, notes: '',
    searchTokens: searchTokens(name), createdAt: at(-120), updatedAt: at(-1),
  });
}
await db.doc('customers/c-lankatech').set({
  type: 'business', name: 'Nadeesha Gunawardana', companyName: 'Lanka Tech Solutions', phone: '071 220 4471',
  phoneKey: '0712204471', secondPhone: '', secondPhoneKey: '', email: 'accounts@lankatech.example', address: { street: '45 Duplication Road', city: 'Colombo 04' },
  tin: '114567890', preferredContact: 'email', whatsappConsent: false, notes: 'Pays by bank transfer; send invoices to accounts@.',
  searchTokens: searchTokens('Nadeesha Gunawardana', 'Lanka Tech Solutions'), createdAt: at(-200), updatedAt: at(-30),
});

const DEVICES = {
  'd-kasun-dell': ['c-kasun', 'Laptop', 'Dell', 'Inspiron 15 3520', '7XK2Q93'],
  'd-kasun-epson': ['c-kasun', 'Printer', 'Epson', 'L3110', ''],
  'd-dilani-mac': ['c-dilani', 'Laptop', 'Apple', 'MacBook Air M1', 'FVFG21AXQ6L4'],
  'd-chamara-asus': ['c-chamara', 'Laptop', 'ASUS', 'VivoBook 15', ''],
  'd-ayesha-acer': ['c-ayesha', 'Laptop', 'Acer', 'Aspire 7', 'NHQ8AL0012'],
  'd-tharindu-pc': ['c-tharindu', 'Desktop', 'Custom', 'Ryzen 5 desktop', ''],
  'd-ruwan-lenovo': ['c-ruwan', 'Laptop', 'Lenovo', 'IdeaPad 3', 'PF3K9ZQ1'],
  'd-shanika-canon': ['c-shanika', 'Printer', 'Canon', 'PIXMA G3010', ''],
};
for (const [id, [customerId, type, brand, model, serial]] of Object.entries(DEVICES)) {
  await db.doc(`devices/${id}`).set({ customerId, type, brand, model, serial, serialKey: serial.toUpperCase(), notes: '', createdAt: at(-120) });
}

const FLOW = ['received', 'diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_repair', 'ready', 'collected'];
const year = new Date().getFullYear();
const staffByEmail = Object.fromEntries(STAFF.map((s, i) => [s.email, { uid: uids[i], name: s.name }]));
const desk = staffByEmail['desk@demo.test'];
const sahan = staffByEmail['tech@demo.test'];
const ishara = staffByEmail['tech2@demo.test'];

// [device, problem, status, tech, bookedDaysAgo, dueInDays, estimate LKR, accessories, condition, pin]
const TICKETS = [
  ['d-kasun-epson', 'Head cleaning, ink reset', 'collected', ishara, -40, -37, 3500, ['Power cable'], [], ''],
  ['d-ruwan-lenovo', 'Battery not charging', 'awaiting_parts', ishara, -9, -4, 14900, ['Charger'], ['Scratches'], ''],
  ['d-tharindu-pc', 'Random restarts under load', 'in_repair', sahan, -6, -2, 24000, ['Power cable'], [], '4321'],
  ['d-ayesha-acer', 'Screen flicker, hinge loose', 'awaiting_approval', sahan, -5, -1, 32000, ['Charger', 'Bag'], ['Dents'], ''],
  ['d-shanika-canon', 'Paper jam, head cleaning', 'ready', ishara, -4, 1, 4500, ['Power cable'], [], ''],
  ['d-kasun-dell', 'No power after power cut. Keep files on Desktop.', 'ready', sahan, -3, 2, 18500, ['Charger', 'Bag'], ['Scratches', 'Dents'], '483920'],
  ['d-dilani-mac', 'Keyboard keys not responding', 'diagnosing', ishara, -1, 3, 0, ['Charger'], [], '1111'],
  ['d-chamara-asus', 'Slow, Windows reinstall', 'received', null, 0, 3, 6500, ['Charger'], [], ''],
];

let n = 0;
for (const [deviceId, problem, status, tech, booked, due, estimate, accessories, condition, pin] of TICKETS) {
  n++;
  const id = `t-demo-${String(n).padStart(2, '0')}`;
  const ticketNo = `T-${year}-${String(n).padStart(4, '0')}`;
  const [customerId, type, brand, model, serial] = DEVICES[deviceId];
  const customer = CUSTOMERS.find((c) => c[0] === customerId);
  const deviceLabel = `${brand} ${model}`;
  const steps = FLOW.slice(0, FLOW.indexOf(status) + 1);
  const t = token(id);
  const closed = status === 'collected';
  await db.doc(`tickets/${id}`).set({
    ticketNo, customerId, customerName: customer[1], customerPhone: customer[2], deviceId, deviceLabel, deviceType: type,
    deviceSerial: serial, problem, accessories, condition, conditionNotes: '', diagnosis: '', status,
    assignedTo: tech?.uid ?? null, assignedName: tech?.name ?? null, estimate: estimate ? estimate * 100 : null, advance: null,
    dueDate: at(due, 18), hasPin: !!pin && !closed, publicToken: t, createdBy: desk.uid, createdByName: desk.name,
    createdAt: at(booked, 9, 30 + n), updatedAt: at(booked + steps.length - 1, 15),
  });
  const history = db.collection(`tickets/${id}/history`);
  for (const old of (await history.get()).docs) await old.ref.delete();
  for (const [i, s] of steps.entries()) {
    const by = i === 0 || s === 'collected' ? desk : tech ?? desk;
    await history.doc(`h${i}`).set({ fromStatus: i ? steps[i - 1] : null, toStatus: s, note: '', byUid: by.uid, byName: by.name, at: at(Math.min(booked + i, 0), 9 + i, 52) });
  }
  await db.doc(`publicStatus/${t}`).set({ ticketNo, status, deviceLabel, dueDate: at(due, 18), updatedAt: at(booked + steps.length - 1, 15) });
  if (pin && !closed) await db.doc(`devices/${deviceId}/secret/pin`).set({ pin, ticketId: id });
}
await db.doc('tickets/t-demo-06/notes/n1').set({
  text: 'Replaced DC jack, reflowed power IC. Ran 2-hour burn-in, battery charging normally. Files backed up to customer’s USB (in bag).',
  byUid: sahan.uid, byName: sahan.name, at: at(-1, 14, 40),
});
await db.doc(`counters/${year}`).set({ ticket: TICKETS.length, quote: 0, invoice: 0 });

console.log('Seeded demo-fixbench: 8 customers, 8 devices, 8 tickets.');
console.log(FRESH_SETUP ? 'The owner will be sent through the setup wizard.' : 'Setup is marked complete (use --fresh-setup to see the wizard).');
console.log(`Sign in at http://localhost:5173 with any of these (password: ${PASSWORD}):`);
for (const s of STAFF) console.log(`  ${s.role.padEnd(10)} ${s.email}`);
