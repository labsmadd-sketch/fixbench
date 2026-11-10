import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { daysFromToday, shortDate } from '../../lib/dates';
import { formatLKR } from '../../lib/money';
import { useQuery } from '../../lib/useFirestore';
import { PAYMENT_METHOD_LABEL, type InventoryItem, type Invoice, type Payment, type PaymentMethod, type Ticket } from '../../types';
import { lowStockQuery } from '../inventory/data';
import { invoicesQuery, paymentsSinceQuery } from '../invoices/data';
import { openTicketsQuery, type TicketRow } from '../tickets/data';
import { isOverdue } from '../tickets/TicketsPage';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Dashboard: open tickets for everyone; unpaid balance and today's takings for the counter. */
export function DashboardPage() {
  const { profile, user } = useSession();
  const navigate = useNavigate();
  const open = useQuery<Ticket>(openTicketsQuery(), 'open-tickets');
  const isTech = profile?.role === 'technician';
  const mineOnly = (t: TicketRow) => !isTech || t.assignedTo === user?.uid;
  const all = open.data.filter(mineOnly);

  const bookedToday = all.filter((t) => daysFromToday(t.createdAt) === 0);
  const ready = all.filter((t) => t.status === 'ready');
  const overdue = all.filter((t) => isOverdue(t));
  const dueToday = all.filter((t) => t.status !== 'ready' && daysFromToday(t.dueDate) === 0);

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const unpaid = useQuery<Invoice>(isTech ? null : invoicesQuery('open', 500), 'dash-unpaid');
  const today = useQuery<Payment>(isTech ? null : paymentsSinceQuery(midnight), `dash-paid-${midnight.getTime()}`);
  const low = useQuery<InventoryItem>(lowStockQuery(), 'low-stock');
  const unpaidTotal = unpaid.data.reduce((s, i) => s + i.balance, 0);
  const takenTotal = today.data.reduce((s, p) => s + p.amount, 0);
  const byMethod = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[])
    .map((m) => [m, today.data.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${PAYMENT_METHOD_LABEL[m]} ${formatLKR(n).replace('LKR ', '')}`)
    .join(' · ');

  const tiles = [
    { label: isTech ? 'My open jobs' : 'Open jobs', n: all.length, to: '/tickets' },
    { label: 'Booked in today', n: bookedToday.length, to: '/tickets' },
    { label: 'Ready for pickup', n: ready.length, to: '/tickets?f=ready' },
    { label: 'Overdue', n: overdue.length, to: '/tickets?f=overdue', alert: overdue.length > 0 },
  ];

  const list = (title: string, rows: TicketRow[], empty: string) => (
    <section className="panel">
      <h2>
        {title}
        {open.loading ? '' : ` · ${rows.length}`}
      </h2>
      {open.loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        rows.slice(0, 8).map((t) => (
          <button key={t.id} className="board__card" onClick={() => navigate(`/tickets/${t.id}`)}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span className="num" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{t.ticketNo}</span>
              <StatusPill status={t.status} />
            </span>
            <strong>{t.deviceLabel}</strong>
            <span className="muted">
              {t.customerName} · {t.customerPhone}
              {t.dueDate ? ` · due ${shortDate(t.dueDate)}` : ''}
            </span>
          </button>
        ))
      )}
    </section>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="h1">
          {greeting()}
          {profile ? `, ${profile.name.split(' ')[0]}` : ''}
        </h1>
        {!isTech && (
          <>
            <Link to="/invoices/new?sale=1" className="btn">
              Counter sale
            </Link>
            <Link to="/tickets/new" className="btn btn--primary">
              <Icon name="plus" /> Book in a device
            </Link>
          </>
        )}
      </div>
      <div className="stats">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="stat" style={{ textDecoration: 'none', color: 'inherit', borderColor: t.alert ? '#fecaca' : undefined }}>
            <span>{t.label}</span>
            <strong className={t.alert ? 'danger-text' : undefined} style={{ fontSize: 26 }}>
              {open.loading ? '…' : t.n}
            </strong>
          </Link>
        ))}
      </div>
      {!isTech && (
        <div className="stats">
          <Link to="/invoices" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span>Unpaid balance</span>
            <strong className="num">{unpaid.loading ? '…' : formatLKR(unpaidTotal)}</strong>
            <span>
              {unpaid.data.length} {unpaid.data.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </Link>
          <div className="stat">
            <span>Taken today</span>
            <strong className="num">{today.loading ? '…' : formatLKR(takenTotal)}</strong>
            <span>{byMethod || 'No payments yet today'}</span>
          </div>
        </div>
      )}
      <div className="cards-3">
        {list('Ready for pickup', ready, 'Nothing waiting to be collected.')}
        {list('Overdue', overdue, 'No overdue jobs.')}
        {list('Due today', dueToday, 'Nothing else due today.')}
        {low.data.length > 0 && (
          <section className="panel">
            <div className="panel__head">
              <h2>Low stock · {low.data.length}</h2>
              <Link to="/inventory?f=low" style={{ fontSize: 13 }}>
                Inventory
              </Link>
            </div>
            {low.data.slice(0, 6).map((i) => (
              <Link key={i.id} to={`/inventory?f=low&item=${i.id}`} className="paper__row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="kv">
                  <strong style={{ fontSize: 14 }}>{i.name}</strong>
                  <span>Reorder at {i.lowStockAt}</span>
                </span>
                <strong className="danger-text num">{i.qty}</strong>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
