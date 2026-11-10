import { doc } from 'firebase/firestore';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { dateTime, shortDate } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { computeTotals } from '../../lib/invoiceTotals';
import { formatAmount, formatLKR } from '../../lib/money';
import { whatsappLink } from '../../lib/phone';
import { useDoc } from '../../lib/useFirestore';
import type { ApprovedVia, Quote, ShopSettings, Ticket } from '../../types';
import { markSent, QUOTE_STATUS, quoteMessage, recordAnswer, type QuoteRow } from './data';

const KIND = { part: 'Part', labour: 'Labour', other: 'Other' } as const;

export function QuotePill({ status }: { status: Quote['status'] }) {
  const s = QUOTE_STATUS[status];
  return (
    <span className="status status--lg" style={{ background: s.bg, color: s.fg }}>
      <span className="status__dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/** /quotes/:id */
export function QuoteDetailPage() {
  const { id = '' } = useParams();
  const q = useDoc<Quote>(doc(db, 'quotes', id), `quotes/${id}`);
  if (q.loading) return <p className="muted">Loading…</p>;
  if (!q.data) return <div className="panel empty">This quote does not exist.</div>;
  return <QuoteDetail q={q.data} />;
}

function QuoteDetail({ q }: { q: QuoteRow }) {
  const { shop, profile, user } = useSession();
  const ticket = useDoc<Ticket>(doc(db, 'tickets', q.ticketId), `tickets/${q.ticketId}`);
  const [answer, setAnswer] = useState<'approved' | 'approved_optional' | 'declined'>('approved');
  const [via, setVia] = useState<ApprovedVia>('whatsapp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = { uid: user?.uid ?? '', name: profile?.name ?? '' };
  const desk = profile?.role !== 'technician';
  const t = ticket.data;
  const tax = shop ?? { vatRegistered: false };
  const rec = computeTotals(q.items.filter((i) => !i.optional), 0, tax);
  const all = computeTotals(q.items, 0, tax);
  const hasOptional = q.items.some((i) => i.optional);
  const message = quoteMessage({ ...q, recommendedTotal: rec.total, optionalTotal: all.total - rec.total }, shop?.name ?? 'the repair shop', formatLKR);
  const open = q.status === 'draft' || q.status === 'sent';

  async function run(f: () => Promise<void>, fail: string) {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (x) {
      console.error(x);
      setError(fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="no-print">
        <p className="crumbs">
          <Link to="/quotes">Quotes</Link> / {q.quoteNo}
        </p>
        <div className="detail-head">
          <div className="detail-head__title">
            <h1>{q.quoteNo}</h1>
            <QuotePill status={q.status} />
            <span className="muted">
              For <Link to={`/tickets/${q.ticketId}`}>{q.ticketNo}</Link> · {q.customerName} · {q.deviceLabel}
            </span>
          </div>
          <div className="actions">
            {q.status === 'draft' && (
              <Link className="btn" to={`/quotes/${q.id}/edit`}>
                Edit
              </Link>
            )}
            <button className="btn" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print
            </button>
            {open && (
              <a
                className="btn btn--primary"
                href={whatsappLink(q.customerPhone, message)}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  // In the background: the screen updates at once and other buttons stay usable.
                  if (q.status === 'draft') markSent(q, t, me).catch(() => setError('Sent, but could not update the job status.'));
                }}
              >
                {q.status === 'draft' ? 'Send on WhatsApp' : 'Send reminder'}
              </a>
            )}
            {q.status === 'approved' && desk && t && !t.invoiceId && (
              <Link className="btn btn--primary" to={`/invoices/new?ticket=${q.ticketId}`}>
                <Icon name="receipt" size={16} /> Invoice from this quote
              </Link>
            )}
          </div>
        </div>
        <ErrorAlert error={error} />

        <div className="detail">
          <div className="detail__main">
            <section className="panel">
              <h2>Diagnosis</h2>
              <p className="prose">{q.diagnosis}</p>
            </section>
            <section className="panel">
              <QuoteLines q={q} />
              <div className="totals" style={{ maxWidth: 360, marginLeft: 'auto', width: '100%' }}>
                <div className="paper__row totals__grand">
                  <span>Quote total</span>
                  <span className="num">{formatLKR(rec.total)}</span>
                </div>
                {hasOptional && (
                  <div className="paper__row">
                    <span>With optional items</span>
                    <span className="num">{formatAmount(all.total)}</span>
                  </div>
                )}
                {shop?.vatRegistered && <span className="field__hint">Includes SSCL and VAT.</span>}
                <span className="muted" style={{ fontSize: 13 }}>Valid until {shortDate(q.validUntil)}</span>
              </div>
            </section>
          </div>

          <aside className="detail__side">
            {open ? (
              <section className="panel">
                <h2>Customer’s answer</h2>
                <p className="muted" style={{ fontSize: 13 }}>Record how {q.customerName.split(' ')[0]} replied. Approving moves the job to Awaiting parts.</p>
                <fieldset className="choices" style={{ gridTemplateColumns: '1fr' }}>
                  <legend className="sr-only">Answer</legend>
                  <label className="choice">
                    <input type="radio" name="ans" checked={answer === 'approved'} onChange={() => setAnswer('approved')} />
                    <strong>Approved</strong>
                  </label>
                  {hasOptional && (
                    <label className="choice">
                      <input type="radio" name="ans" checked={answer === 'approved_optional'} onChange={() => setAnswer('approved_optional')} />
                      <strong>Approved + optional items</strong>
                    </label>
                  )}
                  <label className="choice">
                    <input type="radio" name="ans" checked={answer === 'declined'} onChange={() => setAnswer('declined')} />
                    <strong>Declined</strong>
                  </label>
                </fieldset>
                <label className="sr-only" htmlFor="via">How they replied</label>
                <select id="via" className="select" value={via} onChange={(e) => setVia(e.target.value as ApprovedVia)}>
                  <option value="whatsapp">WhatsApp reply</option>
                  <option value="call">Phone call</option>
                  <option value="in_person">In person</option>
                </select>
                <button className="btn btn--primary" disabled={busy} onClick={() => void run(() => recordAnswer(q, t, answer, via, me), 'Could not save the answer. You may only update your own jobs.')}>
                  Save answer
                </button>
              </section>
            ) : (
              <section className="panel">
                <h2>{q.status === 'approved' ? 'Approved' : 'Declined'}</h2>
                <p className="muted" style={{ fontSize: 13 }}>
                  {q.decidedAt ? dateTime(q.decidedAt) : ''} · {q.decidedBy}
                  {q.approvedVia ? ` · ${q.approvedVia === 'in_person' ? 'in person' : q.approvedVia === 'call' ? 'phone call' : 'WhatsApp'}` : ''}
                  {q.withOptional ? ' · with optional items' : ''}
                </p>
              </section>
            )}
            <section className="panel">
              <h2>Message</h2>
              <p className="prose" style={{ fontSize: 13 }}>{message}</p>
              {q.sentAt && <span className="field__hint">Sent {dateTime(q.sentAt)}</span>}
            </section>
          </aside>
        </div>
      </div>
      <div className="print-only">
        <PrintedQuote q={q} shop={shop} total={rec.total} withOptional={hasOptional ? all.total : null} />
      </div>
    </>
  );
}

function QuoteLines({ q }: { q: QuoteRow }) {
  const groups = [
    { title: 'Recommended', rows: q.items.filter((i) => !i.optional) },
    { title: 'Optional — customer can choose', rows: q.items.filter((i) => i.optional) },
  ].filter((g) => g.rows.length);
  return (
    <>
      {groups.map((g) => (
        <div key={g.title} className="stack" style={{ gap: 6 }}>
          <span className="section-title">{g.title}</span>
          {g.rows.map((it, n) => (
            <div className="paper__row" key={n} style={{ alignItems: 'baseline', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span className="kv">
                <span style={{ color: 'var(--ink)', fontSize: 14 }}>{it.description}</span>
                <span>
                  {KIND[it.kind]}
                  {it.qty !== 1 ? ` · ${it.qty} × ${formatAmount(it.unitPrice)}` : ''}
                </span>
              </span>
              <span className="num">{formatAmount(Math.round(it.qty * it.unitPrice))}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function PrintedQuote({ q, shop, total, withOptional }: { q: QuoteRow; shop: ShopSettings | null; total: number; withOptional: number | null }) {
  return (
    <div className="invoice-print">
      <header className="ip-head">
        <div>
          {shop?.logo && <img src={shop.logo} alt="" className="ip-logo" />}
          <div className="ip-shop">{shop?.name}</div>
          <div>{[shop?.address?.street, shop?.address?.city].filter(Boolean).join(', ')}</div>
          <div>{[shop?.phone, shop?.email].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="ip-title">
          <div className="ip-title__word">QUOTE</div>
          <div className="ip-no">{q.quoteNo}</div>
        </div>
      </header>
      <div className="ip-rule" />
      <div className="ip-meta">
        <div>
          <div className="ip-label">For</div>
          <div><strong>{q.customerName}</strong></div>
          <div>{q.customerPhone}</div>
        </div>
        <div>
          <div className="ip-label">Device</div>
          <div>{q.deviceLabel}</div>
          <div>Job {q.ticketNo}</div>
        </div>
        <div>
          <div className="ip-label">Valid until</div>
          <div>{q.validUntil?.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
      </div>
      <div className="ip-label">Diagnosis</div>
      <p>{q.diagnosis}</p>
      <table className="ip-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit (LKR)</th>
            <th>Amount (LKR)</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, i) => (
            <tr key={i}>
              <td>
                {it.description}
                {it.optional ? ' (optional)' : ''}
              </td>
              <td>{it.qty}</td>
              <td>{formatAmount(it.unitPrice)}</td>
              <td>{formatAmount(Math.round(it.qty * it.unitPrice))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 15 }}>Quote total {formatLKR(total)}</div>
      {withOptional !== null && <div style={{ textAlign: 'right' }}>With optional items {formatLKR(withOptional)}</div>}
      {shop?.terms && (
        <div className="ip-terms">
          <div className="ip-label">Warranty and terms</div>
          {shop.terms}
        </div>
      )}
    </div>
  );
}
