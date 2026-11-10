import { doc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, initials } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { db } from '../../lib/firebase';
import { computeTotals } from '../../lib/invoiceTotals';
import { formatAmount, formatLKR, parseToCents } from '../../lib/money';
import { useDebounced } from '../../lib/useDebounced';
import { useDoc, useQuery } from '../../lib/useFirestore';
import { useOnline } from '../../lib/useOnline';
import { PAYMENT_METHOD_LABEL, type Customer, type PaymentMethod, type Quote, type Ticket } from '../../types';
import { searchCustomers, type CustomerRow } from '../customers/data';
import { approvedLines, ticketQuotesQuery } from '../quotes/data';
import type { TicketRow } from '../tickets/data';
import { issueInvoice, StockError } from './data';
import { checkLines, LineItems, linesFromItems, newLine, useStock } from './LineItems';

/**
 * /invoices/new?ticket=…  invoice for a job (prefilled from an approved quote or the estimate)
 * /invoices/new?sale=1    counter sale: walk-in or a chosen customer, no job
 */
export function NewInvoicePage() {
  const [params] = useSearchParams();
  const ticketId = params.get('ticket');
  const ticket = useDoc<Ticket>(ticketId ? doc(db, 'tickets', ticketId) : null, ticketId ?? '');
  const quotes = useQuery<Quote>(ticketId ? ticketQuotesQuery(ticketId) : null, `quotes-of-${ticketId}`);
  const customerId = ticket.data?.customerId ?? params.get('customer');
  const customer = useDoc<Customer>(customerId ? doc(db, 'customers', customerId) : null, customerId ?? '');

  if (ticket.loading || customer.loading || quotes.loading) return <p className="muted">Loading…</p>;
  if (ticket.data?.invoiceId) {
    return (
      <div className="panel">
        <h1 className="h1" style={{ fontSize: 22 }}>This job already has an invoice</h1>
        <Link to={`/invoices/${ticket.data.invoiceId}`}>Open {ticket.data.invoiceNo}</Link>
      </div>
    );
  }
  if (ticketId && !ticket.data) return <div className="panel">This job no longer exists.</div>;
  const approved = quotes.data.find((q) => q.status === 'approved');
  return (
    <InvoiceEditor
      key={ticketId ?? customerId ?? 'sale'}
      ticket={ticket.data}
      initialCustomer={customer.data}
      quote={approved ?? null}
    />
  );
}

function InvoiceEditor({
  ticket,
  initialCustomer,
  quote,
}: {
  ticket: TicketRow | null;
  initialCustomer: CustomerRow | null;
  quote: (Quote & { id: string }) | null;
}) {
  const { shop, profile, user } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const stock = useStock();
  const [customer, setCustomer] = useState<CustomerRow | null>(initialCustomer);
  const [lines, setLines] = useState(() =>
    quote
      ? linesFromItems(approvedLines(quote))
      : ticket
        ? [newLine({ description: `Repair: ${ticket.deviceLabel} — ${ticket.problem}`.slice(0, 140), kind: 'labour', price: ticket.estimate ? String(ticket.estimate / 100) : '' })]
        : [newLine({ kind: 'part' })],
  );
  const [discount, setDiscount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('cash');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { items, invalid: linesInvalid } = checkLines(lines, stock.byId);
  const discountCents = discount.trim() ? parseToCents(discount) : 0;
  const totals = computeTotals(items, discountCents ?? 0, shop ?? { vatRegistered: false });
  const advance = ticket?.advance ?? 0;
  const invalid = linesInvalid || discountCents === null || advance > totals.total;

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
      setError(
        err instanceof StockError || (err instanceof Error && err.message.startsWith('The advance'))
          ? err.message
          : 'Could not issue the invoice. Check your connection and try again; no number was used.',
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="crumbs">
        <Link to="/invoices">Invoices and sales</Link> / {ticket ? 'New invoice' : 'Counter sale'}
      </p>
      <div className="page-head">
        <h1 className="h1">{ticket ? 'New invoice' : 'Counter sale'}</h1>
        {ticket && (
          <span className="muted">
            {ticket.customerName} · job {ticket.ticketNo} · {ticket.deviceLabel}
          </span>
        )}
      </div>

      <div className="detail">
        <div className="detail__main">
          {quote && (
            <div className="alert alert--ok">
              Filled in from quote <Link to={`/quotes/${quote.id}`}>{quote.quoteNo}</Link>, approved
              {quote.withOptional ? ' with the optional items' : ''}. Change anything that differs.
            </div>
          )}
          <section className="panel">
            <div className="panel__head">
              <h2>Items</h2>
              <span className="muted" style={{ fontSize: 12 }}>Amounts in LKR</span>
            </div>
            <LineItems lines={lines} setLines={setLines} touched={touched} stock={stock} />
            <p className="muted" style={{ fontSize: 12 }}>Parts from stock are deducted when the invoice is issued, and returned if it is voided.</p>
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
            {customer ? (
              <div className="kv">
                <strong>{customer.type === 'business' && customer.companyName ? customer.companyName : customer.name}</strong>
                <span>{[customer.phone, customer.email].filter(Boolean).join(' · ')}</span>
                {customer.tin && shop?.vatRegistered && <span>TIN {customer.tin}</span>}
                {!ticket && (
                  <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => setCustomer(null)}>
                    Change to walk-in
                  </button>
                )}
              </div>
            ) : (
              <CustomerPicker onPick={setCustomer} />
            )}
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

/** Counter sales: walk-in by default, or look up a customer for their history and TIN. */
function CustomerPicker({ onPick }: { onPick: (c: CustomerRow) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 250);
  const [results, setResults] = useState<CustomerRow[]>([]);
  useEffect(() => {
    let live = true;
    searchCustomers(q).then((r) => live && setResults(r), () => live && setResults([]));
    return () => {
      live = false;
    };
  }, [q]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="kv">
        <strong>Walk-in customer</strong>
        <span>Or find a customer to keep it in their history:</span>
      </div>
      <input className="select" type="search" placeholder="Phone or name" aria-label="Find a customer" value={text} onChange={(e) => setText(e.target.value)} />
      {results.slice(0, 5).map((c) => (
        <button type="button" key={c.id} className="picker__item" onClick={() => onPick(c)}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{initials(c.name)}</span>
            <strong>{c.name}</strong>
          </span>
          <span className="muted">{c.phone}</span>
        </button>
      ))}
    </div>
  );
}
