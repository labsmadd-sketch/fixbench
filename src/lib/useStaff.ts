import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import type { StaffProfile } from '../types';

export type StaffMember = StaffProfile & { uid: string };

const ORDER = { owner: 0, manager: 1, frontdesk: 2, technician: 3 } as const;

/** Live staff list, owner first. Owners and managers can read it. */
export function useStaff(): { staff: StaffMember[]; ready: boolean } {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setStaff(
            snap.docs
              .map((d) => ({ uid: d.id, ...(d.data() as StaffProfile) }))
              .sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name)),
          );
          setReady(true);
        },
        () => setReady(true),
      ),
    [],
  );

  return { staff, ready };
}
