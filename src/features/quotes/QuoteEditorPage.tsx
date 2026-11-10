import { doc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, Field } from '../../components/Form';
import { fromDateInput, inDays, toDateInput } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { computeTotals } from '../../lib/invoiceTotals';
import { formatAmount, formatLKR } from '../../lib/money';
import { useDoc } from '../../lib/useFirestore';
import { useOnline } from '../../lib/useOnline';
import type { Quote, QuoteItem, Ticket } from '../../types';
import { checkLines, LineItems, linesFromItems, newLine, useStock } from '../invoices/LineItems';
import type { TicketRow } from '../tickets/data';
import { createQuote, updateDraft, type QuoteRow } from './data';

/** /quotes/new?ticket=… and /quotes/:id/edit (drafts only) */
export function QuoteEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const quote = useDoc<Quote>(id ? doc(db, 'quotes', id) : null, id ?? '');
  const ticketId = quote.data?.ticketId ?? params.get('ticket');
  const ticket = useDoc<Ticket>(ticketId ? doc(db, 'tickets', ticketId) : null, ticketId ?? '');

  if (quote.loading || ticket.loading) return <p className="muted">Loading…</p>;
  if (!ticket.data) return <div className="panel">Open a job and choose “Quote” to write one.</div>;
  if (quote.data && quote.data.status !== 'draft') {
    return <div className="panel">Only drafts can be edited. <Link to={`/quotes/${quote.data.id}`}>Back to {quote.data.quoteNo}</Link></div>;
  }
  return <QuoteEditor key={id ?? ticketId} ticket={ticket.data} quote={quote.data} />;
}

function QuoteEditor({ ticket, quote }: { ticket: TicketRow; quote: QuoteRow | null }) {
  const { shop, profile, user } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const stock = useStock();
  const [diagnosis, setDiagnosis] = useState(quote?.diagnosis ?? ticket.diagnosis ?? '');
  const [lines, setLines] = useState(() =>
    quote ? linesFromItems(quote.items) : [newLine({ kind: 'part', optional: false }), newLine({ kind: 'labour', description: 'Labour — strip, replace and test', optional: false })],
  );
  const [valid, setValid] = useState(quote ? toDateInput(quote.validUntil) : inDays(7));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quotes do not take stock off the shelf, so levels are shown but not enforced.
  const { items, invalid: linesInvalid } = checkLines(lines, new Map());
  const quoteItems = items.map((i) => ({ ...i, optional: !!(i as QuoteItem).optional })) as QuoteItem[];
  const tax = shop ?? { vatRegistered: false };
  const recommended = computeTotals(quoteItems.filter((i) => !i.optional), 0, tax);
  const withOptional = computeTotals(quoteItems, 0, tax);
  const hasOptional = quoteItems.some((i) => i.optional);
  const validDate = fromDateInput(valid);
  const invalid = linesInvalid || !diagnosis.trim() || !validDate;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid || !shop || !user || !profile || !validDate) return;
    if (!quote && !online) return setError('You are offline. A new quote needs a connection to get its number.');
    setBusy(true);
    setError(null);
    try {
      const input = { diagnosis, items: quoteItems, validUntil: validDate };
      const id = quote ? (await updateDraft(quote.id, input), quote.id) : await createQuote(ticket, input, shop, { uid: user.uid, name: profile.name });
      navigate(`/quotes/${id}`, { replace: true });
    } catch (x) {
      console.error(x);
      setError('Could not save the quote. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="crumbs">
        <Link to="/quotes">Quotes</Link> / {quote ? `Edit ${quote.quoteNo}` : 'New'}
      </p>
      <div className="page-head">
        <h1 className="h1">{quote ? `Edit ${quote.quoteNo}` : 'New quote'}</h1>
        <span className="muted">
          For <Link to={`/tickets/${ticket.id}`}>{ticket.ticketNo}</Link> · {ticket.customerName} · {ticket.deviceLabel}
        </span>
      </div>
      <div className="detail">
        <div className="detail__main">
          <section className="panel">
            <Field id="q-diag" label="Diagnosis" hint="What is wrong, in words the customer understands. Also saved on the job." error={touched && !diagnosis.trim() ? 'Describe the fault.' : null}>
              <textarea id="q-diag" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={3} />
            </Field>
          </section>
          <section className="panel">
            <div className="panel__head">
              <h2>Parts and labour</h2>
              <span className="muted" style={{ fontSize: 12 }}>Amounts in LKR</span>
            </div>
            <LineItems lines={lines} setLines={setLines} touched={touched} stock={stock} withOptional checkStock={false} />
          </section>
        </div>
        <aside className="detail__side">
          <section className="panel totals">
            <div className="paper__row totals__grand" style={{ borderTop: 0, paddingTop: 0 }}>
              <span>Quote total</span>
              <span className="num">{formatLKR(recommended.total)}</span>
            </div>
            {hasOptional && (
              <div className="paper__row">
                <span>With optional items</span>
                <span className="num">{formatAmount(withOptional.total)}</span>
              </div>
            )}
            {shop?.vatRegistered && <span className="field__hint">Includes SSCL and VAT.</span>}
            <Field id="q-valid" label="Valid until">
              <input id="q-valid" type="date" value={valid} onChange={(e) => setValid(e.target.value)} />
            </Field>
          </section>
          <ErrorAlert error={touched && invalid ? 'Fill in the diagnosis and every line.' : error} />
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Saving…' : quote ? 'Save changes' : 'Save quote'}
          </button>
          <span className="field__hint">You send it from the next screen. Quotes do not take parts off the shelf; the invoice does.</span>
        </aside>
      </div>
    </form>
  );
}
