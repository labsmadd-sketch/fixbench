import { describe, expect, it } from 'vitest';
import { contrast, deriveTheme, DEFAULT_BRAND } from './brand';

describe('deriveTheme', () => {
  it('falls back to the default brand for bad input', () => {
    expect(deriveTheme('blue')['--brand']).toBe(DEFAULT_BRAND);
    expect(deriveTheme(undefined)['--brand']).toBe(DEFAULT_BRAND);
  });

  it.each([
    '#1D4ED8', // blue
    '#0F766E', // teal
    '#F59E0B', // amber
    '#FACC15', // yellow
    '#7C3AED', // purple
    '#E11D48', // mid-tone rose
    '#3B82F6', // mid-tone blue
    '#E5E7EB', // near white
    '#000000', // black
  ])('keeps %s readable everywhere', (brand) => {
    const t = deriveTheme(brand);
    expect(contrast(t['--on-brand'], t['--brand'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--brand-text'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--brand-ink'], t['--brand-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#CBD5E1', t['--nav-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('uses dark text on a light brand and white on a dark one', () => {
    expect(deriveTheme('#FACC15')['--on-brand']).toBe('#111827');
    expect(deriveTheme('#1D4ED8')['--on-brand']).toBe('#FFFFFF');
  });

  it('leaves colours that already pass unchanged', () => {
    expect(deriveTheme('#1D4ED8')['--brand']).toBe('#1D4ED8');
    expect(deriveTheme('#0F766E')['--brand']).toBe('#0F766E');
  });
});
