import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatPhone, phoneKey } from '../../lib/phone';
import { matchesRest, parseCustomerQuery, searchTokens, serialKey } from '../../lib/search';
import type { WithId } from '../../lib/useFirestore';
import type { Customer, Device, PreferredContact } from '../../types';

export type CustomerRow = WithId<Customer>;

const customers = collection(db, 'customers');
const RESULTS = 20;

/** Counter search: phone (any format, partial) or any part of a name or company. */
export async function searchCustomers(input: string): Promise<CustomerRow[]> {
  const q = parseCustomerQuery(input);
  if (q.kind === 'none') return [];

  if (q.kind === 'phone') {
    const end = q.digits + '';
    const [main, second] = await Promise.all([
      getDocs(query(customers, where('phoneKey', '>=', q.digits), where('phoneKey', '<=', end), limit(RESULTS))),
      getDocs(query(customers, where('secondPhoneKey', '>=', q.digits), where('secondPhoneKey', '<=', end), limit(RESULTS))),
    ]);
    const byId = new Map<string, CustomerRow>();
    for (const d of [...main.docs, ...second.docs]) byId.set(d.id, { id: d.id, ...(d.data() as Customer) });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const snap = await getDocs(query(customers, where('searchTokens', 'array-contains', q.token), limit(50)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Customer) }))
    .filter((c) => matchesRest(q.rest, c.name, c.companyName))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, RESULTS);
}

/** Customers whose main or other phone is exactly this number. */
export async function findByPhone(phone: string, exceptId?: string): Promise<CustomerRow[]> {
  const key = phoneKey(phone);
  if (key.length < 9) return [];
  const [a, b] = await Promise.all([
    getDocs(query(customers, where('phoneKey', '==', key), limit(5))),
    getDocs(query(customers, where('secondPhoneKey', '==', key), limit(5))),
  ]);
  const byId = new Map<string, CustomerRow>();
  for (const d of [...a.docs, ...b.docs]) if (d.id !== exceptId) byId.set(d.id, { id: d.id, ...(d.data() as Customer) });
  return [...byId.values()];
}

/** Customers with the same first and last word of the name ("Nadeesha … Gunawardena"). */
export async function findSimilarName(name: string, exceptId?: string): Promise<CustomerRow[]> {
  const words = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 2) return [];
  // Match on the first name, then compare the start of the last name, so
  // spelling variants (Gunawardana / Gunawardena) still count as similar.
  const first = words[0].slice(0, 12);
  const lastStart = words[words.length - 1].slice(0, 5);
  const snap = await getDocs(query(customers, where('searchTokens', 'array-contains', first), limit(30)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Customer) }))
    .filter((c) => c.id !== exceptId && matchesRest([lastStart], c.name));
}

export interface CustomerInput {
  type: 'individual' | 'business';
  name: string;
  companyName: string;
  phone: string;
  secondPhone: string;
  email: string;
  street: string;
  city: string;
  tin: string;
  preferredContact: PreferredContact;
  whatsappConsent: boolean;
  notes: string;
}

function toDoc(f: CustomerInput) {
  const company = f.type === 'business' ? f.companyName.trim() : '';
  return {
    type: f.type,
    name: f.name.trim(),
    companyName: company,
    phone: formatPhone(f.phone),
    phoneKey: phoneKey(f.phone),
    secondPhone: f.secondPhone.trim() ? formatPhone(f.secondPhone) : '',
    secondPhoneKey: f.secondPhone.trim() ? phoneKey(f.secondPhone) : '',
    email: f.email.trim().toLowerCase(),
    address: { street: f.street.trim(), city: f.city.trim() },
    tin: f.tin.trim(),
    preferredContact: f.preferredContact,
    whatsappConsent: f.whatsappConsent,
    notes: f.notes.trim(),
    searchTokens: searchTokens(f.name, company),
  };
}

/** Create (id null) or update a customer. Returns the id. */
export async function saveCustomer(id: string | null, f: CustomerInput): Promise<string> {
  if (id) {
    await setDoc(doc(db, 'customers', id), { ...toDoc(f), updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = doc(customers);
  // Not awaited: with offline persistence the write is queued and the promise
  // only resolves once the server confirms. The id is known straight away.
  void setDoc(ref, { ...toDoc(f), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

/** Add `phone` as the customer's other phone ("Is this the same person? → Use"). */
export async function addOtherPhone(c: CustomerRow, phone: string): Promise<void> {
  if (c.phoneKey === phoneKey(phone) || c.secondPhoneKey === phoneKey(phone)) return;
  await setDoc(
    doc(db, 'customers', c.id),
    { secondPhone: formatPhone(phone), secondPhoneKey: phoneKey(phone), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export interface DeviceInput {
  type: string;
  brand: string;
  model: string;
  serial: string;
  notes: string;
}

export function deviceLabel(d: Pick<Device, 'brand' | 'model' | 'type'>): string {
  return [d.brand, d.model].filter(Boolean).join(' ') || d.type;
}

/** New device for a customer. Returns its id (the write is queued offline). */
export function addDevice(customerId: string, f: DeviceInput): string {
  const ref = doc(collection(db, 'devices'));
  void setDoc(ref, deviceDoc(customerId, f));
  return ref.id;
}

export function deviceDoc(customerId: string, f: DeviceInput) {
  return {
    customerId,
    type: f.type,
    brand: f.brand.trim(),
    model: f.model.trim(),
    serial: f.serial.trim(),
    serialKey: f.serial.trim() ? serialKey(f.serial) : '',
    notes: f.notes.trim(),
    createdAt: serverTimestamp(),
  };
}

export const customerDevicesQuery = (customerId: string) =>
  query(collection(db, 'devices'), where('customerId', '==', customerId), orderBy('createdAt', 'desc'));

export const customerTicketsQuery = (customerId: string) =>
  query(collection(db, 'tickets'), where('customerId', '==', customerId), orderBy('createdAt', 'desc'), limit(50));

