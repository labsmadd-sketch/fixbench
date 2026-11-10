import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { shortDate } from '../../lib/dates';
import { formatAmount } from '../../lib/money';
import { useQuery } from '../../lib/useFirestore';
import type { Quote, QuoteStatus } from '../../types';
import { QUOTE_STATUS, quotesQuery } from './data';

type Filter = QuoteStatus | 'all';
const FILTERS: Filter[] = ['sent', 'draft', 'approved', 'declined', 'all'];

/** /quotes */
export function QuotesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('f') as Filter) || 'sent';
  const [n, setN] = useState(50);
  const list = useQuery<Quote>(quotesQuery(filter, n), `quotes-${filter}-${n}`);

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Quotes</h1>
        <span className="muted" style={{ fontSize: 13 }}>Quotes are written from a job: open the ticket and choose “Quote”.</span>
      </div>
      <div className="chips" role="group" aria-label="Status">
        {FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setParams(f === 'sent' ? {} : { f }, { replace: true })}>
            {f === 'all' ? 'All' : QUOTE_STATUS[f].label}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Customer and device</th>
              <th className="hide-sm">Job</th>
              <th>Status</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((q) => (
              <tr key={q.id} onClick={() => navigate(`/quotes/${q.id}`)}>
                <td>
                  <Link className="row-link" to={`/quotes/${q.id}`} onClick={(e) => e.stopPropagation()}>
                    {q.quoteNo}
                  </Link>
                  <span className="sub">
                    {shortDate(q.createdAt)} · valid to {shortDate(q.validUntil)}
                  </span>
                </td>
                <td>
                  {q.customerName}
                  <span className="sub">{q.deviceLabel}</span>
                </td>
                <td className="hide-sm">{q.ticketNo}</td>
                <td>
                  <span className="status" style={{ background: QUOTE_STATUS[q.status].bg, color: QUOTE_STATUS[q.status].fg }}>
                    <span className="status__dot" style={{ background: QUOTE_STATUS[q.status].dot }} />
                    {QUOTE_STATUS[q.status].label}
                  </span>
                </td>
                <td className="right num">
                  {formatAmount(q.recommendedTotal)}
                  {q.optionalTotal > 0 && <span className="sub">+{formatAmount(q.optionalTotal)} optional</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data.length === 0 && !list.loading && (
        <div className="empty">
          <Icon name="file" size={28} />
          <strong>No quotes here</strong>
        </div>
      )}
      <div className="table-foot">
        <span>Totals before tax · amounts in LKR</span>
        {list.data.length >= n && (
          <button className="btn btn--sm" onClick={() => setN((x) => x + 50)}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
