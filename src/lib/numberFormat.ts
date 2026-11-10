// Pure numbering helpers (no Firebase), shared by the app, the setup wizard and tests.

export type NumberKind = 'ticket' | 'quote' | 'invoice';

/** 'yearly' restarts at 0001 each January; 'never' keeps counting. */
export type RestartRule = 'yearly' | 'never';

/** The /counters/{id} document a number comes from. */
export function counterId(restart: RestartRule | undefined, now: Date = new Date()): string {
  return restart === 'never' ? 'all' : String(now.getFullYear());
}

/** T-2026-0001 (yearly) or T-0001 (never). */
export function formatNumber(prefix: string, n: number, restart: RestartRule | undefined, now: Date = new Date()): string {
  const seq = String(n).padStart(4, '0');
  return restart === 'never' ? `${prefix}-${seq}` : `${prefix}-${now.getFullYear()}-${seq}`;
}

/** 1–5 capital letters or digits, starting with a letter. */
export function isValidPrefix(prefix: string): boolean {
  return /^[A-Z][A-Z0-9]{0,4}$/.test(prefix);
}
