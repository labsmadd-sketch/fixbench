import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { shortDate } from '../../lib/dates';
import { formatAmount, formatLKR } from '../../lib/money';
import { useQuery } from '../../lib/useFirestore';
import type { Invoice, InvoiceStatus } from '../../types';
import { invoicesQuery } from './data';
import { InvoicePill } from './InvoicePill';

type Filter = 'open' | 'all' | InvoiceStatus;

const FILTERS: { f: Filter; label: string }[] = [
  { f: 'open', label: 'Unpaid and partly paid' },
  { f: 'paid', label: 'Paid' },
  { f: 'void', label: 'Void' },
  { f: 'all', label: 'All' },
];

/** /invoices */
export function InvoicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('f') as Filter) || 'open';
  const [n, setN] = useState(50);
  const [text, setText] = useState('');
  const list = useQuery<Invoice>(invoicesQuery(filter, n), `invoices-${filter}-${n}`);

  const t = text.trim().toLowerCase();
  const rows = list.data.filter(
    (i) => !t || [i.invoiceNo, i.customerName, i.customerPhone, i.ticketNo ?? ''].some((v) => v.toLowerCase().includes(t)),
  );
  const due = rows.filter((i) => i.status !== 'void').reduce((s, i) => s + i.balance, 0);

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Invoices and sales</h1>
        <Link to="/invoices/new?sale=1" className="btn btn--primary">
          <Icon name="plus" /> Counter sale
        </Link>
      </div>

      <div className="toolbar">
        <input className="select" style={{ flex: '1 1 220px', maxWidth: 320 }} type="search" placeholder="Filter by number, name, phone, job…" aria-label="Filter invoices" value={text} onChange={(e) => setText(e.target.value)} />
        <span className="spacer" />
        {filter === 'open' && rows.length > 0 && (
          <span className="muted">
            Balance due: <strong className="num" style={{ color: 'var(--ink)' }}>{formatLKR(due)}</strong>
          </span>
        )}
      </div>

      <div className="chips" role="group" aria-label="Status">
        {FILTERS.map(({ f, label }) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setParams(f === 'open' ? {} : { f }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th className="hide-sm">Job</th>
              <th>Status</th>
              <th className="right">Total</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)}>
                <td>
                  <Link className="row-link" to={`/invoices/${i.id}`} onClick={(e) => e.stopPropagation()}>
                    {i.invoiceNo}
                  </Link>
                  <span className="sub">{shortDate(i.issuedAt)}</span>
                </td>
                <td>
                  {i.customerName}
                  <span className="sub">{i.customerPhone}</span>
                </td>
                <td className="hide-sm">{i.ticketNo ?? <span className="muted">Counter sale</span>}</td>
                <td>
                  <InvoicePill status={i.status} />
                </td>
                <td className="right num">{formatAmount(i.total)}</td>
                <td className={`right num ${i.balance > 0 && i.status !== 'void' ? 'danger-text' : ''}`}>{formatAmount(i.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && !list.loading && (
        <div className="empty">
          <Icon name="receipt" size={28} />
          <strong>{filter === 'open' ? 'Nothing waiting to be paid' : 'No invoices here'}</strong>
        </div>
      )}
      <div className="table-foot">
        <span>
          Showing {rows.length} {rows.length === 1 ? 'invoice' : 'invoices'} · amounts in LKR
        </span>
        {list.data.length >= n && (
          <button className="btn btn--sm" onClick={() => setN((x) => x + 50)}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
