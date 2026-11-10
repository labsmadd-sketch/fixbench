import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { daysFromToday, shortDate } from '../../lib/dates';
import { formatAmount } from '../../lib/money';
import { useQuery } from '../../lib/useFirestore';
import { useStaff } from '../../lib/useStaff';
import { OPEN_STATUSES, type Ticket, type TicketStatus } from '../../types';
import { closedTicketsQuery, openTicketsQuery, type TicketRow } from './data';
import { STATUS } from './status';

type Filter = 'open' | 'overdue' | 'closed' | TicketStatus;

export function isOverdue(t: Pick<Ticket, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (!OPEN_STATUSES.includes(t.status) || t.status === 'ready') return false;
  const d = daysFromToday(t.dueDate, now);
  return d !== null && d < 0;
}

function dueText(t: TicketRow) {
  const d = daysFromToday(t.dueDate);
  if (d === null) return { text: '—', late: false };
  if (isOverdue(t)) return { text: `${shortDate(t.dueDate)} · overdue`, late: true };
  return { text: d === 0 ? 'Today' : shortDate(t.dueDate), late: false };
}

function toCsv(rows: TicketRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Ticket', 'Booked in', 'Customer', 'Phone', 'Device', 'Problem', 'Status', 'Technician', 'Due', 'Estimate (LKR)'];
  const lines = rows.map((t) =>
    [
      t.ticketNo,
      shortDate(t.createdAt),
      t.customerName,
      t.customerPhone,
      t.deviceLabel,
      t.problem,
      STATUS[t.status].label,
      t.assignedName ?? '',
      t.dueDate ? shortDate(t.dueDate) : '',
      t.estimate ? (t.estimate / 100).toFixed(2) : '',
    ]
      .map(esc)
      .join(','),
  );
  return [head.map(esc).join(','), ...lines].join('\r\n');
}

/** /tickets */
export function TicketsPage() {
  const { profile, user } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { staff } = useStaff();
  const isTech = profile?.role === 'technician';

  const filter = (params.get('f') as Filter) || 'open';
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const who = params.get('who') ?? (isTech ? user?.uid ?? 'all' : 'all');
  const [text, setText] = useState('');
  const [closedLimit, setClosedLimit] = useState(50);

  const open = useQuery<Ticket>(openTicketsQuery(), 'open-tickets');
  const closed = useQuery<Ticket>(filter === 'closed' ? closedTicketsQuery(closedLimit) : null, `closed-${filter}-${closedLimit}`);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null || v === '') next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  // Technician and text filters apply before the status chips, so the counts match what you see.
  const base = useMemo(() => {
    const t = text.trim().toLowerCase();
    return open.data.filter(
      (x) =>
        (who === 'all' || (who === 'none' ? !x.assignedTo : x.assignedTo === who)) &&
        (!t || [x.ticketNo, x.customerName, x.customerPhone, x.deviceLabel, x.problem].some((v) => v?.toLowerCase().includes(t))),
    );
  }, [open.data, who, text]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: base.length, overdue: base.filter((t) => isOverdue(t)).length };
    for (const s of OPEN_STATUSES) c[s] = base.filter((t) => t.status === s).length;
    return c;
  }, [base]);

  const rows =
    filter === 'closed'
      ? closed.data
      : filter === 'open'
        ? base
        : filter === 'overdue'
          ? base.filter((t) => isOverdue(t))
          : base.filter((t) => t.status === filter);

  function exportCsv() {
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tickets-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const techs = staff.filter((s) => s.active && (s.role === 'technician' || s.role === 'manager' || s.role === 'owner'));
  const chip = (f: Filter, label: string, n?: number, alert = false) => (
    <button key={f} className={`chip${alert ? ' chip--alert' : ''}`} aria-pressed={filter === f} onClick={() => setParam('f', f === 'open' ? null : f)}>
      {label}
      {n !== undefined && ` · ${n}`}
    </button>
  );

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">{isTech && who === user?.uid ? 'My jobs' : 'Service tickets'}</h1>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'list'} onClick={() => setParam('view', null)}>
            List
          </button>
          <button aria-pressed={view === 'board'} onClick={() => setParam('view', 'board')}>
            Board
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input className="select" style={{ flex: '1 1 220px', maxWidth: 320 }} type="search" placeholder="Filter by name, phone, device…" aria-label="Filter tickets" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="sr-only" htmlFor="who">
          Technician
        </label>
        <select id="who" className="select" value={who} onChange={(e) => setParam('who', e.target.value)}>
          <option value="all">Everyone</option>
          <option value="none">Unassigned</option>
          {techs.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.uid === user?.uid ? `${s.name} (me)` : s.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn btn--sm" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="chips" role="group" aria-label="Status">
        {chip('open', 'All open', counts.open)}
        {OPEN_STATUSES.map((s) => chip(s, STATUS[s].label, counts[s]))}
        {chip('overdue', 'Overdue', counts.overdue, counts.overdue > 0)}
        {chip('closed', 'Collected and cancelled')}
      </div>

      {open.error && <div className="alert alert--error">Could not load tickets. Check your connection.</div>}

      {view === 'board' && filter !== 'closed' ? (
        <div className="board">
          {OPEN_STATUSES.filter((s) => filter === 'open' || filter === 'overdue' || filter === s).map((s) => {
            const col = rows.filter((t) => t.status === s);
            return (
              <section className="board__col" key={s} aria-label={STATUS[s].label}>
                <div className="board__head">
                  <StatusPill status={s} />
                  <span className="muted">{col.length}</span>
                </div>
                {col.map((t) => {
                  const due = dueText(t);
                  return (
                    <button className="board__card" key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                      <span className="num" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{t.ticketNo}</span>
                      <strong>{t.deviceLabel}</strong>
                      <span className="muted">{t.problem}</span>
                      <span className="muted">
                        {t.customerName} · {t.assignedName ?? 'Unassigned'}
                      </span>
                      <span className={due.late ? 'danger-text' : 'muted'}>Due {due.text}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Device and problem</th>
                  <th>Status</th>
                  <th className="hide-sm">Technician</th>
                  <th className="hide-sm">Due</th>
                  <th className="right hide-sm">Estimate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const due = dueText(t);
                  return (
                    <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                      <td>
                        <Link className="row-link" to={`/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}>
                          {t.ticketNo}
                        </Link>
                        <span className="sub">{shortDate(t.createdAt)}</span>
                      </td>
                      <td>
                        {t.customerName}
                        <span className="sub">{t.customerPhone}</span>
                      </td>
                      <td>
                        {t.deviceLabel}
                        <span className="sub">{t.problem}</span>
                      </td>
                      <td>
                        <StatusPill status={t.status} />
                      </td>
                      <td className="hide-sm">{t.assignedName ?? <span className="muted">Unassigned</span>}</td>
                      <td className={`hide-sm ${due.late ? 'danger-text' : ''}`}>{due.text}</td>
                      <td className="right num hide-sm">{t.estimate ? formatAmount(t.estimate) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !open.loading && (
            <div className="empty">
              <Icon name="wrench" size={28} />
              <strong>{filter === 'open' && !text && who === 'all' ? 'No open jobs' : 'Nothing matches these filters'}</strong>
              {!isTech && filter === 'open' && (
                <Link className="btn btn--primary" to="/tickets/new">
                  <Icon name="plus" /> Book in a device
                </Link>
              )}
            </div>
          )}
          <div className="table-foot">
            <span>
              Showing {rows.length} {filter === 'closed' ? 'closed' : 'open'} {rows.length === 1 ? 'ticket' : 'tickets'} · amounts in LKR
            </span>
            {filter === 'closed' && closed.data.length >= closedLimit && (
              <button className="btn btn--sm" onClick={() => setClosedLimit((n) => n + 50)}>
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
