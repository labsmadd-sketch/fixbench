import { deleteField } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { contrast, DEFAULT_BRAND, deriveTheme, isHex } from '../../theme/brand';
import { colorsFromImageUrl, readLogo } from '../../theme/logoColors';
import { ErrorAlert, initials, saveSettings, StepIntro, useSave, type StepProps } from './shared';

const PRESETS = [
  { name: 'Blue', hex: '#1D4ED8' },
  { name: 'Indigo', hex: '#4338CA' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Rose', hex: '#BE123C' },
  { name: 'Orange', hex: '#C2410C' },
  { name: 'Green', hex: '#15803D' },
  { name: 'Sky', hex: '#0369A1' },
];

export function BrandStep({ shop, go }: StepProps) {
  const [logo, setLogo] = useState<string | null>(shop?.logo ?? null);
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [brand, setBrand] = useState((isHex(shop?.brandColor) ? shop!.brandColor! : DEFAULT_BRAND).toUpperCase());
  const [hexDraft, setHexDraft] = useState(brand);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useSave();

  // Suggest colours from a logo saved earlier.
  useEffect(() => {
    if (shop?.logo) colorsFromImageUrl(shop.logo).then(setLogoColors, () => setLogoColors([]));
  }, [shop?.logo]);

  const theme = useMemo(() => deriveTheme(brand), [brand]);
  const ratio = contrast(theme['--on-brand'], theme['--brand']);
  const adjusted = theme['--brand'] !== brand;

  function pick(hex: string) {
    setBrand(hex.toUpperCase());
    setHexDraft(hex.toUpperCase());
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    try {
      const { dataUrl, colors } = await readLogo(file);
      setLogo(dataUrl);
      setLogoColors(colors);
      if (colors[0]) pick(colors[0]);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Could not read that image.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onHexChange(value: string) {
    const v = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    setHexDraft(value);
    if (isHex(v)) setBrand(v.toUpperCase());
  }

  function save() {
    void run(async () => {
      await saveSettings(
        shop,
        { brandColor: brand, logo: logo ?? deleteField() },
        { brandColor: brand, logo: logo ?? deleteField() },
      );
      go(3);
    });
  }

  const swatch = (s: { name: string; hex: string }) => (
    <button
      key={s.hex + s.name}
      type="button"
      className="swatch"
      aria-pressed={brand === s.hex.toUpperCase()}
      onClick={() => pick(s.hex)}
    >
      <span className="swatch__dot" style={{ background: s.hex }} />
      {s.name}
    </button>
  );

  const shopName = shop?.name || 'Your repair shop';

  return (
    <div className="setup__grid">
      <div className="setup__main">
        <StepIntro title="Logo and colours">
          Your logo appears on screens, receipts and invoices. The brand colour themes buttons, links and the sidebar for
          everyone in the shop.
        </StepIntro>

        <div className="logo-drop">
          {logo ? <img className="logo-drop__img" src={logo} alt="Shop logo" /> : <span className="logo-drop__img">No logo</span>}
          <div className="logo-drop__text">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={16} /> {logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {logo && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    setLogo(null);
                    setLogoColors([]);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            <span className="field__hint">PNG, JPG or SVG, ideally square. We shrink it to fit; you can skip this.</span>
            {logoError && <span className="field__error">{logoError}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>

        {logoColors.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <h2 className="section-title">Colours found in your logo</h2>
            <div className="swatches">{logoColors.map((hex, i) => swatch({ name: `Logo ${i + 1}`, hex }))}</div>
          </div>
        )}

        <div className="stack" style={{ gap: 8 }}>
          <h2 className="section-title">{logoColors.length ? 'Or pick a preset' : 'Pick a colour'}</h2>
          <div className="swatches">{PRESETS.map(swatch)}</div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <label className="section-title" htmlFor="brand-hex">
            Custom colour
          </label>
          <div className="hex-input field">
            <input type="color" aria-label="Choose a colour" value={brand.toLowerCase()} onChange={(e) => pick(e.target.value)} />
            <input id="brand-hex" type="text" value={hexDraft} onChange={(e) => onHexChange(e.target.value)} maxLength={7} spellCheck={false} />
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => pick(DEFAULT_BRAND)}>
              Reset to default
            </button>
          </div>
          <span className="field__hint">
            Button text is {theme['--on-brand'] === '#FFFFFF' ? 'white' : 'dark'} · contrast {ratio.toFixed(1)}:1, passes.{' '}
            {adjusted && `Buttons use a slightly darker shade (${theme['--brand']}) so the text stays readable.`}
          </span>
        </div>

        <ErrorAlert error={error} />

        <div className="setup__actions">
          <button type="button" className="btn btn--ghost" onClick={() => go(1)}>
            <Icon name="arrowLeft" /> Back
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Continue to tax and numbering'} <Icon name="arrowRight" />
          </button>
        </div>
      </div>

      <aside className="setup__aside" aria-label="Live preview" style={theme as CSSProperties}>
        <h2 className="section-title">Live preview</h2>
        <div className="preview" aria-hidden="true">
          <div className="preview__nav">
            <span style={{ color: '#fff', fontWeight: 800, gap: 6 }}>
              {logo ? (
                <img src={logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, background: '#fff' }} />
              ) : (
                initials(shopName)
              )}
            </span>
            <span>Dashboard</span>
            <span className="on">Tickets</span>
            <span>Customers</span>
            <span>Invoices</span>
          </div>
          <div className="preview__body">
            <div className="preview__top">
              Service tickets <span className="preview__btn">+ New ticket</span>
            </div>
            <div className="preview__tabs">
              <span className="on">All open</span>
              <span>Ready</span>
            </div>
            <div className="paper__row">
              <span className="preview__link mono">T-2026-0142</span>
              <span>Ready for pickup</span>
            </div>
            <div className="paper__row">
              <span className="preview__link mono">T-2026-0141</span>
              <span>Diagnosing</span>
            </div>
          </div>
        </div>
        <div className="paper" aria-hidden="true">
          <div className="paper__row">
            <strong style={{ color: 'var(--ink)' }}>{shopName}</strong>
            <span className="paper__title">INVOICE</span>
          </div>
          <div className="paper__rule" />
          <span>Printed invoices use the brand colour for the header rule and title.</span>
        </div>
      </aside>
    </div>
  );
}
