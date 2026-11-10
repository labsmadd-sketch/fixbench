import { doc, runTransaction } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon';
import { db } from '../../lib/firebase';
import { formatLKR } from '../../lib/money';
import { counterId, formatNumber, isValidPrefix, type RestartRule } from '../../lib/numberFormat';
import { ErrorAlert, Field, saveSettings, StepError, StepIntro, useSave, type StepProps } from './shared';

const DEFAULT_TERMS =
  'Parts carry a 3-month warranty. Devices not collected within 60 days of notification may be disposed of. We are not responsible for data loss.';

const SAMPLE_SUBTOTAL = 1_000_000; // LKR 10,000.00 in cents

function parseRate(v: string): number | null {
  const n = Number(v.trim());
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}

export function TaxStep({ shop, go, inSettings }: StepProps) {
  const [vat, setVat] = useState(shop?.vatRegistered ?? false);
  const [vatRate, setVatRate] = useState(shop?.taxRates ? String(shop.taxRates.vat) : '');
  const [ssclRate, setSsclRate] = useState(shop?.taxRates ? String(shop.taxRates.sscl) : '');
  const [restart, setRestart] = useState<RestartRule>(shop?.numberRestart ?? 'yearly');
  const [prefixes, setPrefixes] = useState(shop?.prefixes ?? { ticket: 'T', quote: 'Q', invoice: 'INV' });
  const [startHigher, setStartHigher] = useState(false);
  const [firstInvoice, setFirstInvoice] = useState('');
  const [terms, setTerms] = useState(shop?.terms ?? DEFAULT_TERMS);
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useSave();

  const startNo = Number(firstInvoice);
  const errors = {
    vat: vat && parseRate(vatRate) === null ? 'Enter the VAT rate as a percentage.' : null,
    sscl: vat && parseRate(ssclRate) === null ? 'Enter the SSCL rate (0 if it does not apply).' : null,
    ticket: isValidPrefix(prefixes.ticket) ? null : 'Use 1–5 capital letters or digits.',
    quote: isValidPrefix(prefixes.quote) ? null : 'Use 1–5 capital letters or digits.',
    invoice: isValidPrefix(prefixes.invoice) ? null : 'Use 1–5 capital letters or digits.',
    first:
      startHigher && !(Number.isInteger(startNo) && startNo > 1 && startNo < 1_000_000)
        ? 'Enter a whole number above 1.'
        : null,
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const invalid = Object.values(errors).some(Boolean);

  const setPrefix = (k: keyof typeof prefixes) => (e: { target: { value: string } }) =>
    setPrefixes({ ...prefixes, [k]: e.target.value.toUpperCase().replace(/\s/g, '') });

  const invoiceNo = formatNumber(prefixes.invoice || 'INV', startHigher && startNo > 1 ? startNo : 1, restart);
  const vatAmt = vat ? Math.round((SAMPLE_SUBTOTAL * (parseRate(vatRate) ?? 0)) / 100) : 0;
  const ssclAmt = vat ? Math.round((SAMPLE_SUBTOTAL * (parseRate(ssclRate) ?? 0)) / 100) : 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    void run(async () => {
      // Starting number first: it can only be set while no numbers exist yet.
      if (startHigher) {
        const ref = doc(db, 'counters', counterId(restart));
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists()) {
            const d = snap.data();
            if (d.invoice === startNo - 1 && !d.ticket && !d.quote) return; // saved already (retry)
            throw new StepError(
              'Numbers have already been issued, so the starting invoice number can no longer be changed.',
            );
          }
          tx.set(ref, { invoice: startNo - 1 });
        });
      }
      await saveSettings(shop, {
        vatRegistered: vat,
        ...(vat ? { taxRates: { vat: parseRate(vatRate)!, sscl: parseRate(ssclRate)! } } : {}),
        currency: 'LKR',
        numberRestart: restart,
        prefixes,
        terms: terms.trim(),
      });
      go(4);
    });
  }

  return (
    <form className="setup__grid" onSubmit={onSubmit} noValidate>
      <div className="setup__main">
        <StepIntro title="Tax and numbering">How your invoices are numbered and whether they show tax.</StepIntro>

        <fieldset className="choices">
          <legend>Is the shop registered for VAT?</legend>
          <label className="choice">
            <input type="radio" name="vat" checked={!vat} onChange={() => setVat(false)} />
            <strong>No</strong>
            <span>Invoices print as “Invoice” with no tax lines</span>
          </label>
          <label className="choice">
            <input type="radio" name="vat" checked={vat} onChange={() => setVat(true)} />
            <strong>Yes</strong>
            <span>Adds VAT and SSCL lines and your TIN; prints “Tax Invoice”</span>
          </label>
        </fieldset>

        {vat && (
          <div className="form-grid">
            <Field id="vat-rate" label="VAT rate (%)" error={shown('vat')}>
              <input id="vat-rate" inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} aria-invalid={!!shown('vat')} />
            </Field>
            <Field id="sscl-rate" label="SSCL rate (%)" error={shown('sscl')}>
              <input id="sscl-rate" inputMode="decimal" value={ssclRate} onChange={(e) => setSsclRate(e.target.value)} aria-invalid={!!shown('sscl')} />
            </Field>
            <div className="alert alert--warn span-2">
              Check the current VAT and SSCL rates and how they apply with the Inland Revenue Department or your accountant.
              {!shop?.tin && ' Add your shop TIN in step 1 so it prints on tax invoices.'}
            </div>
          </div>
        )}

        <div className="form-grid">
          <Field id="currency" label="Currency">
            <input id="currency" value="LKR — Sri Lankan rupee" readOnly />
          </Field>
          <fieldset className="choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <legend>Restart numbers each</legend>
            <label className="choice">
              <input type="radio" name="restart" checked={restart === 'yearly'} onChange={() => setRestart('yearly')} />
              <strong>Calendar year</strong>
            </label>
            <label className="choice">
              <input type="radio" name="restart" checked={restart === 'never'} onChange={() => setRestart('never')} />
              <strong>Never</strong>
            </label>
          </fieldset>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h2 className="section-title">Number prefixes</h2>
          <div className="form-grid form-grid--3">
            {(
              [
                ['ticket', 'Tickets'],
                ['quote', 'Quotes'],
                ['invoice', 'Invoices'],
              ] as const
            ).map(([k, label]) => (
              <Field
                key={k}
                id={`prefix-${k}`}
                label={label}
                error={shown(k)}
                hint={
                  <>
                    First: <span className="mono">{formatNumber(prefixes[k] || '?', k === 'invoice' && startHigher && startNo > 1 ? startNo : 1, restart)}</span>
                  </>
                }
              >
                <input id={`prefix-${k}`} value={prefixes[k]} onChange={setPrefix(k)} maxLength={5} className="mono" aria-invalid={!!shown(k)} />
              </Field>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={startHigher} onChange={(e) => setStartHigher(e.target.checked)} />
          Moving from another system? Start invoice numbers from a higher number
        </label>
        {startHigher && (
          <Field id="first-invoice" label="First invoice number in FixBench" error={shown('first')} hint="Only possible before the first invoice is issued.">
            <input id="first-invoice" inputMode="numeric" value={firstInvoice} onChange={(e) => setFirstInvoice(e.target.value.replace(/\D/g, ''))} aria-invalid={!!shown('first')} placeholder="e.g. 1250" />
          </Field>
        )}

        <Field id="terms" label="Warranty and terms" hint="Printed on receipts and invoices.">
          <textarea id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
        </Field>

        <ErrorAlert error={touched && invalid ? 'Fix the highlighted fields to continue.' : error} />

        <div className="setup__actions">
          {!inSettings && (
            <button type="button" className="btn btn--ghost" onClick={() => go(2)}>
              <Icon name="arrowLeft" /> Back
            </button>
          )}
          <span className="spacer" />
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Saving…' : inSettings ? 'Save changes' : 'Continue to staff'} {!inSettings && <Icon name="arrowRight" />}
          </button>
        </div>
      </div>

      <aside className="setup__aside" aria-label="Invoice preview">
        <h2 className="section-title">Your first invoice will look like</h2>
        <div className="paper">
          <div className="paper__row">
            <strong style={{ color: 'var(--ink)' }}>{shop?.name || 'Your repair shop'}</strong>
            <span className="paper__title">{vat ? 'TAX INVOICE' : 'INVOICE'}</span>
          </div>
          {vat && shop?.tin && <span>TIN {shop.tin}</span>}
          <div className="paper__rule" />
          <div className="paper__row">
            <span>Number</span>
            <span className="mono">{invoiceNo}</span>
          </div>
          <div className="paper__row">
            <span>Subtotal</span>
            <span className="mono">{formatLKR(SAMPLE_SUBTOTAL)}</span>
          </div>
          {vat ? (
            <>
              <div className="paper__row">
                <span>VAT {parseRate(vatRate) ?? '–'}%</span>
                <span className="mono">{formatLKR(vatAmt)}</span>
              </div>
              <div className="paper__row">
                <span>SSCL {parseRate(ssclRate) ?? '–'}%</span>
                <span className="mono">{formatLKR(ssclAmt)}</span>
              </div>
            </>
          ) : (
            <div className="paper__row">
              <span>VAT</span>
              <span>not shown</span>
            </div>
          )}
          <div className="paper__row" style={{ fontWeight: 800, color: 'var(--ink)' }}>
            <span>Total</span>
            <span className="mono">{formatLKR(SAMPLE_SUBTOTAL + vatAmt + ssclAmt)}</span>
          </div>
          {terms.trim() && <span style={{ fontSize: 11 }}>{terms.trim().slice(0, 90)}{terms.trim().length > 90 ? '…' : ''}</span>}
        </div>
        {vat && <p className="muted" style={{ fontSize: 12 }}>Sample figures only. The invoices module confirms how each tax is calculated.</p>}
      </aside>
    </form>
  );
}
