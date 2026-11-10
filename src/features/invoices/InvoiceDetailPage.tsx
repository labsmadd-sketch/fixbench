import { doc } from 'firebase/firestore';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, Field } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { dateTime, shortDate } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { formatAmount, formatLKR, parseToCents } from '../../lib/money';
import { whatsappLink } from '../../lib/phone';
import { useDoc, useQuery } from '../../lib/useFirestore';
import { useOnline } from '../../lib/useOnline';
import { PAYMENT_METHOD_LABEL, type Invoice, type Payment, type PaymentMethod, type ShopSettings, type Ticket } from '../../types';
import { changeStatus } from '../tickets/data';
import { invoiceMessage, paymentsQuery, recordPayment, voidInvoice, type InvoiceRow, type PaymentRow } from './data';
import { InvoicePill } from './InvoicePill';

const KIND = { part: 'Part', labour: 'Labour', other: 'Other' } as const;

/** /invoices/:id */
export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const inv = useDoc<Invoice>(doc(db, 'invoices', id), `invoices/${id}`);
  if (inv.loading) return <p className="muted">Loading…</p>;
  if (!inv.data) return <div className="panel empty">This invoice does not exist.</div>;
  return <InvoiceDetail inv={inv.data} />;
}

function InvoiceDetail({ inv }: { inv: InvoiceRow }) {
  const { shop, profile, user } = useSession();
  const payments = useQuery<Payment>(paymentsQuery(inv.id), `payments-${inv.id}`);
  const ticket = useDoc<Ticket>(inv.ticketId ? doc(db, 'tickets', inv.ticketId) : null, inv.ticketId ?? '');
  const [voidOpen, setVoidOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = profile?.role === 'owner';
  const me = { uid: user?.uid ?? '', name: profile?.name ?? '' };
  const isVoid = inv.status === 'void';
  const message = invoiceMessage(inv, shop?.name ?? 'the repair shop', formatLKR);
  const t = ticket.data;

  function handOver() {
    if (!t) return;
    setError(null);
    changeStatus(t, 'collected', `Handed over · ${inv.invoiceNo}`, me).catch(() => setError('Could not mark the job as collected.'));
  }

  return (
    <>
      <div className="no-print">
        <p className="crumbs">
          <Link to="/invoices">Invoices and sales</Link> / {inv.invoiceNo}
        </p>
        <div className="detail-head">
          <div className="detail-head__title">
            <h1>{inv.invoiceNo}</h1>
            <InvoicePill status={inv.status} large />
            <span className="muted">
              {inv.type === 'repair' ? 'Repair' : 'Sale'}
              {inv.ticketNo && (
                <>
                  {' · from '}
                  <Link to={`/tickets/${inv.ticketId}`}>{inv.ticketNo}</Link>
                </>
              )}
              {' · issued '}
              {shortDate(inv.issuedAt)}
            </span>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print or save PDF
            </button>
            {!isVoid && (
              <a className="btn" href={whatsappLink(inv.customerPhone, message)} target="_blank" rel="noreferrer">
                Send on WhatsApp
              </a>
            )}
            {!isVoid && inv.customerEmail && (
              <a className="btn" href={`mailto:${inv.customerEmail}?subject=${encodeURIComponent(`Invoice ${inv.invoiceNo} from ${shop?.name ?? ''}`)}&body=${encodeURIComponent(message)}`}>
                Email
              </a>
            )}
            {isOwner && !isVoid && (
              <button className="btn" onClick={() => setVoidOpen(true)} style={{ color: 'var(--danger)' }}>
                Void
              </button>
            )}
          </div>
        </div>
        {isVoid && (
          <div className="alert alert--error" style={{ marginBottom: 16 }}>
            Voided {inv.voidedAt ? shortDate(inv.voidedAt) : ''} by {inv.voidedBy}: {inv.voidReason}. The number {inv.invoiceNo} stays used.
          </div>
        )}
        <ErrorAlert error={error} />

        <div className="detail">
          <div className="detail__main">
            <div className="cards-3">
              <section className="panel">
                <span className="section-title">Bill to</span>
                <div className="kv">
                  <Link to={`/customers/${inv.customerId}`} style={{ fontWeight: 800, fontSize: 16 }}>
                    {inv.customerName}
                  </Link>
                  <span>{[inv.customerPhone, inv.customerEmail].filter(Boolean).join(' · ')}</span>
                  {inv.vatRegistered && inv.customerTin && <span>TIN {inv.customerTin}</span>}
                </div>
              </section>
              <section className="panel">
                <span className="section-title">{inv.vatRegistered ? 'Tax invoice' : 'Invoice'}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {inv.vatRegistered
                    ? `VAT ${inv.taxRates?.vat ?? 0}% · SSCL ${inv.taxRates?.sscl ?? 0}%`
                    : 'Not VAT registered · prints as “Invoice”'}
                </span>
                {inv.deviceLabel && <span style={{ fontSize: 13 }}>Device: {inv.deviceLabel}</span>}
              </section>
            </div>

            <section className="panel">
              <div className="table-wrap">
                <table className="data" style={{ border: 0 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="right">Qty</th>
                      <th className="right hide-sm">Unit price</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((it, i) => (
                      <tr key={i} style={{ cursor: 'default' }}>
                        <td>
                          {it.description}
                          <span className="sub">{KIND[it.kind]}</span>
                        </td>
                        <td className="right num">{it.qty}</td>
                        <td className="right num hide-sm">{formatAmount(it.unitPrice)}</td>
                        <td className="right num">{formatAmount(Math.round(it.qty * it.unitPrice))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Totals inv={inv} />
            </section>
          </div>

          <aside className="detail__side">
            {!isVoid && inv.balance > 0 && <RecordPayment inv={inv} me={me} />}
            {!isVoid && inv.balance === 0 && t && t.status !== 'collected' && (
              <section className="panel">
                <h2>Paid in full</h2>
                <p className="muted" style={{ fontSize: 13 }}>Hand the device back and close job {t.ticketNo}.</p>
                <button className="btn btn--primary" onClick={handOver}>
                  Mark {t.ticketNo} as collected
                </button>
              </section>
            )}
            {t && t.status === 'collected' && (
              <section className="panel">
                <span className="section-title">Job</span>
                <span>
                  {t.ticketNo} <StatusPill status={t.status} />
                </span>
              </section>
            )}
            <section className="panel">
              <h2>Payments</h2>
              {payments.data.length === 0 && <p className="muted">No payments yet.</p>}
              {payments.data.map((p) => (
                <div className="paper__row" key={p.id} style={{ alignItems: 'baseline' }}>
                  <span className="kv">
                    <strong style={{ fontSize: 14 }}>
                      {p.note === 'advance' ? 'Advance · ' : ''}
                      {PAYMENT_METHOD_LABEL[p.method]}
                    </strong>
                    <span>
                      {dateTime(p.at)} · {p.byName.split(' ')[0]}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                  </span>
                  <span className="num">{formatAmount(p.amount)}</span>
                </div>
              ))}
            </section>
          </aside>
        </div>
      </div>

      <div className="print-only">
        <PrintedInvoice inv={inv} shop={shop} payments={payments.data} />
      </div>
      {voidOpen && <VoidDialog onClose={() => setVoidOpen(false)} onVoid={(reason) => voidInvoice(inv.id, reason, me).catch(() => setError('Could not void the invoice.'))} />}
    </>
  );
}

function Totals({ inv }: { inv: InvoiceRow }) {
  return (
    <div className="totals" style={{ maxWidth: 360, marginLeft: 'auto', width: '100%' }}>
      <div className="paper__row">
        <span>Subtotal</span>
        <span className="num">{formatAmount(inv.subtotal)}</span>
      </div>
      {inv.discount > 0 && (
        <div className="paper__row">
          <span>Discount</span>
          <span className="num">−{formatAmount(inv.discount)}</span>
        </div>
      )}
      {inv.vatRegistered && (
        <>
          <div className="paper__row">
            <span>SSCL {inv.taxRates?.sscl ?? 0}%</span>
            <span className="num">{formatAmount(inv.sscl)}</span>
          </div>
          <div className="paper__row">
            <span>VAT {inv.taxRates?.vat ?? 0}%</span>
            <span className="num">{formatAmount(inv.vat)}</span>
          </div>
        </>
      )}
      <div className="paper__row totals__grand">
        <span>Total</span>
        <span className="num">{formatLKR(inv.total)}</span>
      </div>
      <div className="paper__row">
        <span>Paid</span>
        <span className="num">{formatAmount(inv.paid)}</span>
      </div>
      <div className="paper__row" style={{ fontWeight: 800, color: inv.balance > 0 && inv.status !== 'void' ? 'var(--danger)' : undefined }}>
        <span>Balance due</span>
        <span className="num">{formatLKR(inv.balance)}</span>
      </div>
    </div>
  );
}

function RecordPayment({ inv, me }: { inv: InvoiceRow; me: { uid: string; name: string } }) {
  const online = useOnline();
  const [amount, setAmount] = useState(String(inv.balance / 100));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBalance, setLastBalance] = useState(inv.balance);

  // Refill with the new balance after a part payment.
  if (lastBalance !== inv.balance) {
    setLastBalance(inv.balance);
    setAmount(String(inv.balance / 100));
  }

  const cents = parseToCents(amount);
  const err = cents === null || cents <= 0 ? 'Enter an amount.' : cents > inv.balance ? 'That is more than the balance due.' : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (err || cents === null) return setError(err);
    if (!online) return setError('You are offline. Recording a payment needs a connection.');
    setBusy(true);
    setError(null);
    try {
      await recordPayment(inv.id, { amount: cents, method, reference }, me);
      setReference('');
    } catch (x) {
      setError(x instanceof Error && !/permission|network|offline/i.test(x.message) ? x.message : 'Could not record the payment. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit} noValidate>
      <h2>Record a payment</h2>
      <Field id="pay-amount" label="Amount (LKR)" hint="Pre-filled with the balance; change it for a part payment.">
        <input id="pay-amount" inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error && !!err} />
      </Field>
      <fieldset className="choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <legend>Method</legend>
        {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
          <label className="choice" key={m}>
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
            <strong>{PAYMENT_METHOD_LABEL[m]}</strong>
          </label>
        ))}
      </fieldset>
      <Field id="pay-ref" label="Reference" optional hint={method === 'cash' ? undefined : 'Card slip, transfer or QR reference'}>
        <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <ErrorAlert error={error} />
      <button className="btn btn--primary btn--lg" type="submit" disabled={busy || !online}>
        {busy ? 'Recording…' : `Record ${cents && cents > 0 && !err ? formatLKR(cents) : 'payment'}`}
      </button>
    </form>
  );
}

function VoidDialog({ onClose, onVoid }: { onClose: () => void; onVoid: (reason: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [reason, setReason] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => closeRef.current();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, []);
  return (
    <dialog className="dialog" ref={ref}>
      <form
        method="dialog"
        onSubmit={(e) => {
          if (!reason.trim()) {
            e.preventDefault();
            return;
          }
          onVoid(reason);
        }}
      >
        <h2>Void this invoice?</h2>
        <p className="muted">The invoice stays on record with its number, marked void. Payments already recorded are kept. This cannot be undone.</p>
        <Field id="void-reason" label="Reason" hint="Shown on the invoice, e.g. “Issued twice by mistake”.">
          <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" style={{ background: 'var(--danger)', color: '#fff' }} disabled={!reason.trim()}>
            Void invoice
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** A4 layout for printing or "Save as PDF" (see screens.css .invoice-print). */
function PrintedInvoice({ inv, shop, payments }: { inv: InvoiceRow; shop: ShopSettings | null; payments: PaymentRow[] }) {
  const title = inv.status === 'void' ? 'VOID' : inv.vatRegistered ? 'TAX INVOICE' : 'INVOICE';
  return (
    <div className="invoice-print">
      <header className="ip-head">
        <div>
          {shop?.logo && <img src={shop.logo} alt="" className="ip-logo" />}
          <div className="ip-shop">{shop?.name}</div>
          <div>{[shop?.address?.street, shop?.address?.city].filter(Boolean).join(', ')}</div>
          <div>{[shop?.phone, shop?.email].filter(Boolean).join(' · ')}</div>
          {inv.vatRegistered && shop?.tin && <div>TIN {shop.tin}</div>}
        </div>
        <div className="ip-title">
          <div className="ip-title__word">{title}</div>
          <div className="ip-no">{inv.invoiceNo}</div>
        </div>
      </header>
      <div className="ip-rule" />
      <div className="ip-meta">
        <div>
          <div className="ip-label">Bill to</div>
          <div><strong>{inv.customerName}</strong></div>
          <div>{inv.customerPhone}</div>
          {inv.customerEmail && <div>{inv.customerEmail}</div>}
          {inv.vatRegistered && inv.customerTin && <div>TIN {inv.customerTin}</div>}
        </div>
        {inv.ticketNo && (
          <div>
            <div className="ip-label">Device</div>
            <div>{inv.deviceLabel}</div>
            <div>Job {inv.ticketNo}</div>
          </div>
        )}
        <div>
          <div className="ip-label">Date</div>
          <div>{inv.issuedAt ? inv.issuedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div>
          <div>Due on collection</div>
        </div>
      </div>
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
          {inv.items.map((it, i) => (
            <tr key={i}>
              <td>
                {it.description}
                {it.kind === 'labour' ? ' (labour)' : ''}
              </td>
              <td>{it.qty}</td>
              <td>{formatAmount(it.unitPrice)}</td>
              <td>{formatAmount(Math.round(it.qty * it.unitPrice))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ip-bottom">
        <div className="ip-payments">
          {payments.length > 0 && (
            <>
              <div className="ip-label">Payments</div>
              {payments.map((p) => (
                <div key={p.id}>
                  {p.at ? p.at.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {PAYMENT_METHOD_LABEL[p.method]} · {formatLKR(p.amount)}
                  {p.note === 'advance' ? ' (advance)' : ''}
                </div>
              ))}
            </>
          )}
        </div>
        <Totals inv={inv} />
      </div>
      {inv.status === 'void' && <p className="ip-void">Voided: {inv.voidReason}</p>}
      {shop?.terms && (
        <div className="ip-terms">
          <div className="ip-label">Warranty and terms</div>
          {shop.terms}
        </div>
      )}
      <p className="ip-foot">
        Thank you for your business.{!inv.vatRegistered && ' Not a tax invoice — shop not VAT registered.'}
      </p>
    </div>
  );
}
