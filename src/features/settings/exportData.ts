import { collection, collectionGroup, doc, getDoc, getDocs, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Everything the shop owns, as plain JSON. Device passwords are left out on
// purpose (they are deleted on collection anyway) and so is the public status
// copy, which can be rebuilt from the tickets.
const COLLECTIONS = ['users', 'counters', 'customers', 'devices', 'tickets', 'invoices', 'quotes', 'inventory'] as const;
const SUBCOLLECTIONS = ['history', 'notes', 'payments', 'movements'] as const;

/** Firestore values → JSON (timestamps as ISO strings). */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as DocumentData).map(([k, x]) => [k, plain(x)]));
  return v;
}

export interface ExportResult {
  json: string;
  counts: Record<string, number>;
}

export async function exportAll(projectId: string): Promise<ExportResult> {
  const data: Record<string, { id: string; path: string; data: unknown }[]> = {};
  const counts: Record<string, number> = {};

  const settings = await Promise.all(['shop', 'public'].map((id) => getDoc(doc(db, 'settings', id))));
  data.settings = settings.filter((s) => s.exists()).map((s) => ({ id: s.id, path: s.ref.path, data: plain(s.data()) }));

  const groups = await Promise.all([
    ...COLLECTIONS.map((c) => getDocs(collection(db, c))),
    ...SUBCOLLECTIONS.map((c) => getDocs(collectionGroup(db, c))),
  ]);
  [...COLLECTIONS, ...SUBCOLLECTIONS].forEach((name, i) => {
    data[name] = groups[i].docs.map((d) => ({ id: d.id, path: d.ref.path, data: plain(d.data()) }));
  });
  for (const [k, v] of Object.entries(data)) counts[k] = v.length;

  const json = JSON.stringify({ app: 'FixBench', format: 1, projectId, exportedAt: new Date().toISOString(), counts, data }, null, 1);
  return { json, counts };
}

export function download(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
