import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { daysFromToday, shortDate } from '../../lib/dates';
import { useQuery } from '../../lib/useFirestore';
import type { Ticket } from '../../types';
import { openTicketsQuery, type TicketRow } from '../tickets/data';
import { isOverdue } from '../tickets/TicketsPage';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Dashboard from the open tickets (one live query). Money tiles arrive with invoices in Phase 3. */
export function DashboardPage() {
  const { profile, user } = useSession();
  const navigate = useNavigate();
  const open = useQuery<Ticket>(openTicketsQuery(), 'open-tickets');
  const isTech = profile?.role === 'technician';
  const mineOnly = (t: TicketRow) => !isTech || t.assignedTo === user?.uid;
  const all = open.data.filter(mineOnly);

  const today = all.filter((t) => daysFromToday(t.createdAt) === 0);
  const ready = all.filter((t) => t.status === 'ready');
  const overdue = all.filter((t) => isOverdue(t));
  const dueToday = all.filter((t) => t.status !== 'ready' && daysFromToday(t.dueDate) === 0);

  const tiles = [
    { label: isTech ? 'My open jobs' : 'Open jobs', n: all.length, to: '/tickets' },
    { label: 'Booked in today', n: today.length, to: '/tickets' },
    { label: 'Ready for pickup', n: ready.length, to: '/tickets?f=ready' },
    { label: 'Overdue', n: overdue.length, to: '/tickets?f=overdue', alert: overdue.length > 0 },
  ];

  const list = (title: string, rows: TicketRow[], empty: string) => (
    <section className="panel">
      <h2>
        {title} · {rows.length}
      </h2>
      {rows.length === 0 ? (
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
          <Link to="/tickets/new" className="btn btn--primary">
            <Icon name="plus" /> Book in a device
          </Link>
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
      <div className="cards-3">
        {list('Ready for pickup', ready, 'Nothing waiting to be collected.')}
        {list('Overdue', overdue, 'No overdue jobs.')}
        {list('Due today', dueToday, 'Nothing else due today.')}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Unpaid balances and today’s takings appear here once invoices arrive (Phase 3).</p>
    </div>
  );
}
