import {
  onSnapshot,
  type DocumentReference,
  type FirestoreError,
  type Query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

export type WithId<T> = T & { id: string };

interface Live<T> {
  data: T;
  loading: boolean;
  error: FirestoreError | null;
}

/**
 * Live document. `key` must change whenever the reference changes (React can't
 * compare Firestore references), e.g. the document path.
 */
export function useDoc<T>(ref: DocumentReference | null, key: string): Live<WithId<T> | null> {
  const [state, setState] = useState<Live<WithId<T> | null>>({ data: null, loading: !!ref, error: null });
  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) =>
        setState({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) } as WithId<T>) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Live query results. `key` must describe the query (filters, limit). */
export function useQuery<T>(q: Query | null, key: string): Live<WithId<T>[]> {
  const [state, setState] = useState<Live<WithId<T>[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }) as WithId<T>), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
