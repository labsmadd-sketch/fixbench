import { doc, serverTimestamp, writeBatch, type FieldValue } from 'firebase/firestore';
import { useState, type ReactNode } from 'react';
import { db } from '../../lib/firebase';
import type { PublicShop, ShopSettings } from '../../types';

export interface StepProps {
  shop: ShopSettings | null;
  /** Go to a step (1–5). */
  go: (step: number) => void;
}

type Patch<T> = { [K in keyof T]?: T[K] | FieldValue };

/** What a brand-new /settings/shop needs before any step has been saved. */
const NEW_SHOP: Omit<ShopSettings, 'name' | 'phone'> = {
  currency: 'LKR',
  vatRegistered: false,
  prefixes: { ticket: 'T', quote: 'Q', invoice: 'INV' },
  numberRestart: 'yearly',
  plan: 'spark',
  setupComplete: false,
};

/**
 * Save one step. Private settings and the public branding copy are written
 * together, so the sign-in and status pages never show stale details.
 */
export async function saveSettings(
  shop: ShopSettings | null,
  shopPatch: Patch<ShopSettings>,
  publicPatch?: Patch<PublicShop>,
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'settings', 'shop'),
    { ...(shop ? {} : NEW_SHOP), ...shopPatch, updatedAt: serverTimestamp() },
    { merge: true },
  );
  if (publicPatch) batch.set(doc(db, 'settings', 'public'), publicPatch, { merge: true });
  await batch.commit();
}

/** Busy/error state for a step's Continue button. */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, failMessage = 'Could not save. Check your connection and try again.') {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof StepError ? e.message : failMessage);
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

/** An error whose message is safe to show as-is. */
export class StepError extends Error {}

export function StepIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="setup__intro">
      <h1 tabIndex={-1} style={{ outline: 'none' }}>
        {title}
      </h1>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function ErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      {error}
    </div>
  );
}

export function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      {children}
      {error ? (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'FB';
