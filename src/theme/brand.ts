/**
 * Brand theming. A shop chooses ONE colour; everything else is derived so the
 * result is always readable. Mirrors the "Theming" section of the plan and the
 * logic used in the design canvas.
 */

export const DEFAULT_BRAND = '#1D4ED8';
const INK = '#111827';
const NEAR_BLACK = '#0B0F19';

export type ThemeVars = Record<
  | '--brand'
  | '--on-brand'
  | '--brand-text'
  | '--brand-soft'
  | '--brand-tint'
  | '--brand-ink'
  | '--nav-bg'
  | '--nav-active'
  | '--nav-raised',
  string
>;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Mix `a` toward `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const p = toRgb(a);
  const q = toRgb(b);
  return toHex(p.map((v, i) => v + (q[i] - v) * t));
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Darken until the colour reaches `target` contrast on white. */
export function readableOnWhite(hex: string, target = 4.5): string {
  let c = hex.toUpperCase();
  for (let i = 0; i < 20 && contrast(c, '#FFFFFF') < target; i++) c = mix(c, '#000000', 0.1);
  return c;
}

/** White or ink text, whichever contrasts more with the brand. */
export function textOn(hex: string): string {
  return contrast(hex, '#FFFFFF') >= contrast(hex, INK) ? '#FFFFFF' : INK;
}

/**
 * Mid-tone colours (around 18–25% luminance) reach only ~4.2:1 with either
 * white or ink text. Nudge those slightly darker until button text passes 4.5:1.
 */
export function buttonSafe(hex: string): string {
  let c = hex.toUpperCase();
  for (let i = 0; i < 20 && contrast(textOn(c), c) < 4.5; i++) c = mix(c, '#000000', 0.06);
  return c;
}

export function deriveTheme(brandColor: string | undefined | null): ThemeVars {
  const brand = buttonSafe(isHex(brandColor) ? brandColor : DEFAULT_BRAND);
  const text = readableOnWhite(brand);
  return {
    '--brand': brand,
    '--on-brand': textOn(brand),
    '--brand-text': text,
    '--brand-soft': mix(brand, '#FFFFFF', 0.88),
    '--brand-tint': mix(brand, '#FFFFFF', 0.95),
    '--brand-ink': mix(text, '#000000', 0.3),
    '--nav-bg': mix(brand, NEAR_BLACK, 0.86),
    '--nav-active': mix(brand, NEAR_BLACK, 0.68),
    '--nav-raised': mix(brand, NEAR_BLACK, 0.58),
  };
}

const CACHE_KEY = 'fixbench.theme';

/** Apply to <html> and cache, so the next load paints branded immediately. */
export function applyTheme(vars: ThemeVars): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(vars));
  } catch {
    // Private mode or blocked storage: theming still works for this session.
  }
}
