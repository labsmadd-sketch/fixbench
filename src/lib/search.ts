// Firestore has no "contains" search, so each customer stores the prefixes of
// every word in their name and company (`searchTokens`). Typing "fern" then
// matches "Kasun Fernando" with one array-contains query.

const MAX_PREFIX = 12;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9඀-෿஀-௿]+/)
    .filter(Boolean);
}

/** Prefixes (2–12 characters) of every word in the given texts. */
export function searchTokens(...texts: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const w of texts.flatMap((t) => words(t ?? ''))) {
    for (let i = Math.min(2, w.length); i <= Math.min(w.length, MAX_PREFIX); i++) out.add(w.slice(0, i));
  }
  return [...out];
}

export type CustomerQuery =
  | { kind: 'phone'; digits: string }
  | { kind: 'name'; token: string; rest: string[] }
  | { kind: 'none' };

/** Decide how to search for what was typed at the counter. */
export function parseCustomerQuery(input: string): CustomerQuery {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s\-()+]/g, '');
  if (/^\d{3,}$/.test(digits)) {
    // "+94 77…" / "94 77…" → "077…" so it matches phoneKey.
    let d = digits;
    if (d.startsWith('0094')) d = '0' + d.slice(4);
    else if (d.startsWith('94') && d.length > 3) d = '0' + d.slice(2);
    else if (!d.startsWith('0') && d.length >= 9) d = '0' + d;
    return { kind: 'phone', digits: d };
  }
  const w = words(trimmed);
  if (!w.length || (w.length === 1 && w[0].length < 2)) return { kind: 'none' };
  // Query on the longest word; filter the rest in the browser.
  const sorted = [...w].sort((a, b) => b.length - a.length);
  return { kind: 'name', token: sorted[0].slice(0, MAX_PREFIX), rest: sorted.slice(1) };
}

/** True when every extra word typed matches the start of some word in the text. */
export function matchesRest(rest: string[], ...texts: (string | undefined)[]): boolean {
  const have = texts.flatMap((t) => words(t ?? ''));
  return rest.every((r) => have.some((h) => h.startsWith(r)));
}

/** "T-2026-0142", "t20260142", "0142" → a ticket-number-ish query, or null. */
export function looksLikeTicketNo(input: string): boolean {
  return /^[a-z]{1,5}-?\d{4}-?\d{1,6}$/i.test(input.trim()) || /^[a-z]{1,5}-\d{1,6}$/i.test(input.trim());
}

/** Upper-case, no spaces or dashes: how serial numbers are stored for lookup. */
export function serialKey(serial: string): string {
  return serial.toUpperCase().replace(/[\s-]/g, '');
}
