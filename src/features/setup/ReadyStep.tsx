import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { formatNumber } from '../../lib/numberFormat';
import { DEFAULT_BRAND } from '../../theme/brand';
import { ROLE_LABEL } from '../../types';
import { ErrorAlert, saveSettings, StepIntro, useSave, type StepProps } from './shared';
import { useStaff } from '../../lib/useStaff';

type Paper = '80' | 'a4';

export function ReadyStep({ shop, go }: StepProps) {
  const navigate = useNavigate();
  const { staff } = useStaff();
  const [paper, setPaper] = useState<Paper>('80');
  const { busy, error, run } = useSave();

  const missing = !shop?.name || !shop?.phone;
  const restart = shop?.numberRestart ?? 'yearly';
  const prefixes = shop?.prefixes ?? { ticket: 'T', quote: 'Q', invoice: 'INV' };

  const counts = (['manager', 'technician', 'frontdesk'] as const)
    .map((r) => [r, staff.filter((s) => s.role === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${ROLE_LABEL[r].toLowerCase()}`);
  const staffText =
    staff.length <= 1 ? 'Just you (add people later in Settings)' : `${staff.length} people · ${counts.join(', ')}`;

  const rows: { label: string; value: string; step?: number }[] = [
    { label: 'Shop', value: [shop?.name || 'Not set', shop?.address?.city].filter(Boolean).join(' · '), step: 1 },
    { label: 'Brand', value: `${(shop?.brandColor ?? DEFAULT_BRAND).toUpperCase()} · ${shop?.logo ? 'logo added' : 'no logo'}`, step: 2 },
    {
      label: 'Tax',
      value: shop?.vatRegistered
        ? `VAT registered${shop.taxRates ? ` · VAT ${shop.taxRates.vat}% · SSCL ${shop.taxRates.sscl}%` : ''} · LKR`
        : 'Not VAT registered · LKR',
      step: 3,
    },
    {
      label: 'Numbers',
      value: `${formatNumber(prefixes.ticket, 1, restart)} · ${prefixes.quote}- · ${prefixes.invoice}- · ${restart === 'yearly' ? 'restart each year' : 'never restart'}`,
      step: 3,
    },
    { label: 'Staff', value: staffText, step: 4 },
    { label: 'Plan', value: shop?.plan === 'blaze' ? 'Blaze · pay as you go' : 'Spark · free' },
  ];

  function finish(to: string) {
    void run(async () => {
      await saveSettings(shop, { setupComplete: true });
      navigate(to, { replace: true });
    });
  }

  function printTest() {
    const style = document.createElement('style');
    style.textContent = `@page { size: ${paper === '80' ? '80mm auto' : 'A4'}; margin: ${paper === '80' ? '4mm' : '15mm'}; }`;
    document.head.appendChild(style);
    document.documentElement.classList.add('printing');
    const done = () => {
      document.documentElement.classList.remove('printing');
      style.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  const now = new Date();

  return (
    <div className="setup__main">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <StepIntro title={missing ? 'Almost ready' : 'Your shop is ready'}>
          Check the summary, print a test receipt, then book in your first device.
        </StepIntro>
        <button className="btn btn--primary btn--lg" disabled={busy || missing} onClick={() => finish('/')}>
          {busy ? 'Saving…' : 'Open the dashboard'} <Icon name="arrowRight" />
        </button>
      </div>

      {missing && (
        <div className="alert alert--warn" role="alert">
          The shop name and phone are needed for receipts.{' '}
          <button className="link-button" onClick={() => go(1)}>
            Add them in step 1
          </button>
        </div>
      )}
      <ErrorAlert error={error} />

      <div className="setup__grid">
        <section className="stack" style={{ gap: 10 }} aria-labelledby="summary-h">
          <h2 className="section-title" id="summary-h">Summary</h2>
          <dl className="summary">
            {rows.map((r) => (
              <div className="summary__row" key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
                {r.step ? (
                  <button className="link-button" onClick={() => go(r.step!)} aria-label={`Edit ${r.label.toLowerCase()}`}>
                    Edit
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </dl>
        </section>

        <aside className="setup__aside" aria-labelledby="printer-h">
          <h2 className="section-title" id="printer-h">Check your printer</h2>
          <p className="muted" style={{ fontSize: 13 }}>Print a sample intake receipt to check the paper size, logo and text.</p>
          <fieldset className="choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <legend className="sr-only">Paper</legend>
            <label className="choice">
              <input type="radio" name="paper" checked={paper === '80'} onChange={() => setPaper('80')} />
              <strong>80mm receipt</strong>
            </label>
            <label className="choice">
              <input type="radio" name="paper" checked={paper === 'a4'} onChange={() => setPaper('a4')} />
              <strong>A4</strong>
            </label>
          </fieldset>
          <button className="btn" onClick={printTest}>
            <Icon name="printer" size={16} /> Print a test receipt
          </button>
        </aside>
      </div>

      <section className="stack" style={{ gap: 10 }} aria-labelledby="next-h">
        <h2 className="section-title" id="next-h">Good first steps</h2>
        <div className="next-steps">
          <button className="next-step" disabled={busy || missing} onClick={() => finish('/tickets/new')}>
            <strong>Book in a device</strong>
            <span>Create your first ticket</span>
          </button>
          <button className="next-step" disabled={busy || missing} onClick={() => finish('/inventory')}>
            <strong>Add your stock</strong>
            <span>Type items or import a CSV</span>
          </button>
          <button className="next-step" disabled={busy || missing} onClick={() => finish('/customers')}>
            <strong>Import customers</strong>
            <span>Bring a CSV from your old system</span>
          </button>
        </div>
      </section>

      {/* Only visible when printing (see global.css). Black only: thermal printers. */}
      <div className={`print-sample print-sample--${paper}`} aria-hidden="true">
        {shop?.logo && <img src={shop.logo} alt="" />}
        <h1>{shop?.name || 'Your repair shop'}</h1>
        {(shop?.address?.street || shop?.address?.city) && (
          <p className="c">{[shop?.address?.street, shop?.address?.city].filter(Boolean).join(', ')}</p>
        )}
        <p className="c">{[shop?.phone, shop?.whatsapp && `WA ${shop.whatsapp}`].filter(Boolean).join(' · ')}</p>
        <hr />
        <p className="c"><strong>TEST RECEIPT — NOT A REAL JOB</strong></p>
        <p>Ticket: {formatNumber(prefixes.ticket, 1, restart, now)}</p>
        <p>Date: {now.toLocaleString('en-LK')}</p>
        <p>Customer: Sample Customer · 077 000 0000</p>
        <p>Device: Laptop — Sample Brand Model 14</p>
        <p>Problem: Does not power on</p>
        <p>Accessories: Charger</p>
        <hr />
        {shop?.terms && <p>{shop.terms}</p>}
        <p className="c">Thank you</p>
      </div>
    </div>
  );
}
