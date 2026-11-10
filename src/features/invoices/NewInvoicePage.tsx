import { doc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { db } from '../../lib/firebase';
import { computeTotals } from '../../lib/invoiceTotals';
import { formatAmount, formatLKR, parseToCents } from '../../lib/money';
import { useDoc } from '../../lib/useFirestore';
import { useOnline } from '../../lib/useOnline';
import { PAYMENT_METHOD_LABEL, type Customer, type InvoiceItem, type PaymentMethod, type Ticket } from '../../types';
import type { CustomerRow } from '../customers/data';
import type { TicketRow } from '../tickets/data';
import { issueInvoice } from './data';

interface Line {
  key: number;
  description: string;
  kind: InvoiceItem['kind'];
  qty: string;
  price: string;
}

let nextKey = 1;
const line = (l: Partial<Line> = {}): Line => ({ key: nextKey++, description: '', kind: 'labour', qty: '1', price: '', ...l });

/** /invoices/new?ticket=… (or ?customer=… for an invoice without a job) */
export function NewInvoicePage() {
  const [params] = useSearchParams();
  const ticketId = params.get('ticket');
  const ticket = useDoc<Ticket>(ticketId ? doc(db, 'tickets', ticketId) : null, ticketId ?? '');
  const customerId = ticket.data?.customerId ?? params.get('customer');
  const customer = useDoc<Customer>(customerId ? doc(db, 'customers', customerId) : null, customerId ?? '');

  if (ticket.loading || customer.loading) return <p className="muted">Loading…</p>;
  if (ticket.data?.invoiceId) {
    return (
      <div className="panel">
        <h1 className="h1" style={{ fontSize: 22 }}>This job already has an invoice</h1>
        <Link to={`/invoices/${ticket.data.invoiceId}`}>Open {ticket.data.invoiceNo}</Link>
      </div>
    );
  }
  if (!customer.data) return <div className="panel">Choose a customer or job to invoice.</div>;
  return <InvoiceEditor key={ticketId ?? customerId} ticket={ticket.data} customer={customer.data} />;
}

function InvoiceEditor({ ticket, customer }: { ticket: TicketRow | null; customer: CustomerRow }) {
  const { shop, profile, user } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const [lines, setLines] = useState<Line[]>(() =>
    ticket
      ? [line({ description: `Repair: ${ticket.deviceLabel} — ${ticket.problem}`.slice(0, 140), kind: 'labour', price: ticket.estimate ? String(ticket.estimate / 100) : '' })]
      : [line()],
  );
  const [discount, setDiscount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('cash');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = lines.map((l) => ({ l, qty: Number(l.qty), cents: parseToCents(l.price) }));
  const lineErrors = parsed.map(({ l, qty, cents }) =>
    !l.description.trim() ? 'Describe the item.' : !(qty > 0 && qty <= 1000) ? 'Check the quantity.' : cents === null || cents < 0 ? 'Enter a price.' : null,
  );
  const discountCents = discount.trim() ? parseToCents(discount) : 0;
  const items: InvoiceItem[] = parsed
    .filter((_, i) => !lineErrors[i])
    .map(({ l, qty, cents }) => ({ description: l.description.trim(), kind: l.kind, qty, unitPrice: cents ?? 0 }));
  const totals = computeTotals(items, discountCents ?? 0, shop ?? { vatRegistered: false });
  const advance = ticket?.advance ?? 0;
  const invalid = lineErrors.some(Boolean) || discountCents === null || lines.length === 0 || advance > totals.total;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid || !shop || !user || !profile) return;
    if (!online) return setError('You are offline. Issuing an invoice needs a connection to get the number.');
    setBusy(true);
    setError(null);
    try {
      const res = await issueInvoice(
        { customer, ticket, items, discount: totals.discount, advance: advance ? { amount: advance, method: advanceMethod } : null },
        shop,
        { uid: user.uid, name: profile.name },
      );
      navigate(`/invoices/${res.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message.startsWith('The advance') ? err.message : 'Could not issue the invoice. Check your connection and try again; no number was used.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="crumbs">
        <Link to="/invoices">Invoices and sales</Link> / New
      </p>
      <div className="page-head">
        <h1 className="h1">New invoice</h1>
        <span className="muted">
          {customer.name}
          {ticket ? ` · job ${ticket.ticketNo} · ${ticket.deviceLabel}` : ''}
        </span>
      </div>

      <div className="detail">
        <div className="detail__main">
          <section className="panel">
            <div className="panel__head">
              <h2>Items</h2>
              <span className="muted" style={{ fontSize: 12 }}>Amounts in LKR</span>
            </div>
            <div className="lines">
              {lines.map((l, i) => (
                <div className="line" key={l.key}>
                  <div className="field line__desc">
                    <label htmlFor={`d-${l.key}`} className={i ? 'sr-only' : undefined}>Description</label>
                    <input id={`d-${l.key}`} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} aria-invalid={touched && !!lineErrors[i]} placeholder="DC power jack with cable" />
                  </div>
                  <div className="field">
                    <label htmlFor={`k-${l.key}`} className={i ? 'sr-only' : undefined}>Type</label>
                    <select id={`k-${l.key}`} value={l.kind} onChange={(e) => update(l.key, { kind: e.target.value as InvoiceItem['kind'] })}>
                      <option value="part">Part</option>
                      <option value="labour">Labour</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field line__qty">
                    <label htmlFor={`q-${l.key}`} className={i ? 'sr-only' : undefined}>Qty</label>
                    <input id={`q-${l.key}`} inputMode="decimal" className="num" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`p-${l.key}`} className={i ? 'sr-only' : undefined}>Unit price</label>
                    <input id={`p-${l.key}`} inputMode="decimal" className="num" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} aria-invalid={touched && parsed[i].cents === null} />
                  </div>
                  <span className="line__amount num">
                    {parsed[i].cents !== null && parsed[i].qty > 0 ? formatAmount(Math.round(parsed[i].cents! * parsed[i].qty)) : '—'}
                  </span>
                  <button type="button" className="btn btn--ghost btn--sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
                    ✕
                  </button>
                  {touched && lineErrors[i] && <span className="field__error line__error">{lineErrors[i]}</span>}
                </div>
              ))}
            </div>
            <div className="toggles">
              <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, line({ kind: 'part' })])}>
                + Part
              </button>
              <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, line({ kind: 'labour' })])}>
                + Labour
              </button>
              <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, line({ kind: 'other' })])}>
                + Other
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Picking parts from stock (and deducting them) arrives with inventory in Phase 4.</p>
          </section>

          {advance > 0 && (
            <section className="panel">
              <h2>Advance taken at intake</h2>
              <p className="muted">{formatLKR(advance)} is recorded as the first payment on this invoice.</p>
              <fieldset className="choices" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                <legend>How was it paid?</legend>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <label className="choice" key={m}>
                    <input type="radio" name="adv" checked={advanceMethod === m} onChange={() => setAdvanceMethod(m)} />
                    <strong>{PAYMENT_METHOD_LABEL[m]}</strong>
                  </label>
                ))}
              </fieldset>
            </section>
          )}
        </div>

        <aside className="detail__side">
          <section className="panel">
            <h2>Bill to</h2>
            <div className="kv">
              <strong>{customer.type === 'business' && customer.companyName ? customer.companyName : customer.name}</strong>
              <span>{[customer.phone, customer.email].filter(Boolean).join(' · ')}</span>
              {customer.tin && shop?.vatRegistered && <span>TIN {customer.tin}</span>}
            </div>
            <span className="tag" style={{ alignSelf: 'flex-start' }}>
              {shop?.vatRegistered ? 'Prints as “Tax Invoice”' : 'Not VAT registered · prints as “Invoice”'}
            </span>
          </section>

          <section className="panel totals">
            <div className="paper__row">
              <span>Subtotal</span>
              <span className="num">{formatAmount(totals.subtotal)}</span>
            </div>
            <div className="paper__row" style={{ alignItems: 'center' }}>
              <label htmlFor="discount">Discount</label>
              <input id="discount" className="select num" style={{ width: 120, textAlign: 'right' }} inputMode="decimal" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-invalid={discountCents === null} />
            </div>
            {shop?.vatRegistered && (
              <>
                <div className="paper__row">
                  <span>SSCL {shop.taxRates?.sscl ?? 0}%</span>
                  <span className="num">{formatAmount(totals.sscl)}</span>
                </div>
                <div className="paper__row">
                  <span>VAT {shop.taxRates?.vat ?? 0}%</span>
                  <span className="num">{formatAmount(totals.vat)}</span>
                </div>
              </>
            )}
            <div className="paper__row totals__grand">
              <span>Total</span>
              <span className="num">{formatLKR(totals.total)}</span>
            </div>
            {advance > 0 && (
              <>
                <div className="paper__row">
                  <span>Advance paid</span>
                  <span className="num">{formatAmount(advance)}</span>
                </div>
                <div className="paper__row" style={{ fontWeight: 800 }}>
                  <span>Balance due</span>
                  <span className="num">{formatLKR(Math.max(0, totals.total - advance))}</span>
                </div>
              </>
            )}
          </section>

          <ErrorAlert error={touched && invalid ? (advance > totals.total ? 'The advance is more than the total. Check the prices.' : 'Fix the highlighted lines.') : error} />
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !online}>
            <Icon name="receipt" /> {busy ? 'Issuing…' : 'Issue invoice'}
          </button>
          <span className={online ? 'field__hint' : 'field__error'}>
            {online ? 'The invoice number is issued when you save. Invoices can be voided by the owner, never deleted.' : 'You are offline. Reconnect to issue the invoice.'}
          </span>
        </aside>
      </div>
    </form>
  );
}
