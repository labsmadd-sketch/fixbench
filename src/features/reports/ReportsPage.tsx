import {
  collection,
  collectionGroup,
  count,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  sum,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ErrorAlert } from '../../components/Form';
import { fromDateInput, toDateInput } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { formatAmount, formatLKR } from '../../lib/money';
import { PAYMENT_METHOD_LABEL, type HistoryEntry, type Invoice, type Payment } from '../../types';
import { download } from '../settings/exportData';
import { byMethod, dailyTotals, daysIn, invoiceSummary, presetRange, readyByPerson, topParts, type Range } from './calc';
import { DailyBars } from './DailyBars';

type Preset = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];
const MAX_DAYS = 92;

interface Data {
  payments: { amount: number; method: Payment['method']; at: Date }[];
  invoices: Invoice[];
  history: HistoryEntry[];
  booked: number;
  outstanding: { total: number; count: number };
}

const ts = (d: Date) => Timestamp.fromDate(d);

async function load(r: Range): Promise<Data> {
  const [pay, inv, hist, booked, out] = await Promise.all([
    getDocs(query(collectionGroup(db, 'payments'), where('at', '>=', ts(r.from)), where('at', '<', ts(r.to)), orderBy('at'))),
    getDocs(query(collection(db, 'invoices'), where('issuedAt', '>=', ts(r.from)), where('issuedAt', '<', ts(r.to)), orderBy('issuedAt'))),
    getDocs(query(collectionGroup(db, 'history'), where('at', '>=', ts(r.from)), where('at', '<', ts(r.to)), orderBy('at'))),
    // Aggregation queries: one read per 1,000 documents counted.
    getCountFromServer(query(collection(db, 'tickets'), where('createdAt', '>=', ts(r.from)), where('createdAt', '<', ts(r.to)))),
    getAggregateFromServer(query(collection(db, 'invoices'), where('status', 'in', ['unpaid', 'partial'])), { total: sum('balance'), count: count() }),
  ]);
  return {
    payments: pay.docs.map((d) => {
      const p = d.data() as Payment;
      return { amount: p.amount, method: p.method, at: p.at.toDate() };
    }),
    invoices: inv.docs.map((d) => d.data() as Invoice),
    history: hist.docs.map((d) => d.data() as HistoryEntry),
    booked: booked.data().count,
    outstanding: { total: out.data().total ?? 0, count: out.data().count },
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function csv(rows: (string | number)[][]) {
  return '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** /reports — owner and manager. */
export function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(() => {
    const m = presetRange('month');
    return { from: toDateInput(m.from), to: toDateInput(new Date(m.to.getTime() - 1)) };
  });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cFrom = fromDateInput(custom.from);
  const cTo = fromDateInput(custom.to);
  const customRange: Range | null =
    cFrom && cTo && cTo >= cFrom
      ? { from: new Date(cFrom.getFullYear(), cFrom.getMonth(), cFrom.getDate()), to: new Date(cTo.getFullYear(), cTo.getMonth(), cTo.getDate() + 1) }
      : null;
  const range = preset === 'custom' ? customRange : presetRange(preset);
  const tooLong = range ? daysIn(range) > MAX_DAYS : false;
  const key = range ? `${range.from.getTime()}-${range.to.getTime()}` : '';

  useEffect(() => {
    if (!range || tooLong) return;
    let live = true;
    setData(null);
    setError(null);
    load(range).then(
      (d) => live && setData(d),
      (e) => {
        console.error(e);
        if (live) setError('Could not load the report. Check your connection.');
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tooLong]);

  const days = data && range ? dailyTotals(data.payments, range) : [];
  const taken = data?.payments.reduce((s, p) => s + p.amount, 0) ?? 0;
  const inv = data ? invoiceSummary(data.invoices) : null;
  const methods = data ? byMethod(data.payments) : [];
  const parts = data ? topParts(data.invoices) : [];
  const ready = data ? readyByPerson(data.history) : [];
  const collected = data?.history.filter((h) => h.toStatus === 'collected').length ?? 0;
  const stamp = range ? `${toDateInput(range.from)}_to_${toDateInput(new Date(range.to.getTime() - 1))}` : '';

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="h1">Reports</h1>
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="chips" role="group" aria-label="Period" style={{ marginBottom: 0 }}>
          {PRESETS.map((p) => (
            <button key={p.id} className="chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="select" type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="muted">to</span>
            <input className="select" type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </span>
        )}
      </div>
      {tooLong && <div className="alert alert--warn">Choose up to {MAX_DAYS} days at a time.</div>}
      {preset === 'custom' && !range && <div className="alert alert--warn">Choose a start date before the end date.</div>}
      <ErrorAlert error={error} />

      <div className="stats">
        <div className="stat">
          <span>Money taken</span>
          <strong className="num">{data ? formatLKR(taken) : '…'}</strong>
          <span>{data ? plural(data.payments.length, 'payment') : ''}</span>
        </div>
        <div className="stat">
          <span>Invoiced</span>
          <strong className="num">{inv ? formatLKR(inv.total) : '…'}</strong>
          <span>{inv ? `${plural(inv.count, 'invoice')}${inv.sales ? ` · ${plural(inv.sales, 'counter sale')}` : ''}${inv.voided ? ` · ${inv.voided} void` : ''}` : ''}</span>
        </div>
        <div className="stat">
          <span>Outstanding now</span>
          <strong className={`num ${data && data.outstanding.total > 0 ? 'danger-text' : ''}`}>{data ? formatLKR(data.outstanding.total) : '…'}</strong>
          <span>{data ? `${data.outstanding.count} unpaid or part-paid` : ''}</span>
        </div>
        <div className="stat">
          <span>Jobs</span>
          <strong>{data ? `${data.booked} in · ${collected} out` : '…'}</strong>
          <span>Booked in · collected</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Money taken per day</h2>
          <button
            className="btn btn--sm"
            disabled={!data}
            onClick={() => download(`takings-${stamp}.csv`, csv([['Date', 'Taken (LKR)'], ...days.map((d) => [d.day, (d.total / 100).toFixed(2)])]), 'text/csv;charset=utf-8')}
          >
            Export CSV
          </button>
        </div>
        {data ? (
          taken > 0 ? (
            <DailyBars days={days} />
          ) : (
            <p className="muted">No payments in this period.</p>
          )
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>

      <div className="cards-3">
        <section className="panel">
          <h2>Payment methods</h2>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Payments</th>
                <th scope="col">LKR</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.method}>
                  <th scope="row" style={{ fontWeight: 600 }}>{PAYMENT_METHOD_LABEL[m.method]}</th>
                  <td>{m.count}</td>
                  <td className="num">{formatAmount(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && methods.length === 0 && <p className="muted">No payments.</p>}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Top parts</h2>
            <button
              className="btn btn--sm"
              disabled={!parts.length}
              onClick={() => download(`top-parts-${stamp}.csv`, csv([['Part', 'Qty', 'Revenue (LKR)'], ...parts.map((p) => [p.name, p.qty, (p.revenue / 100).toFixed(2)])]), 'text/csv;charset=utf-8')}
            >
              CSV
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Qty</th>
                <th scope="col">LKR</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.name}>
                  <th scope="row" style={{ fontWeight: 600 }}>{p.name}</th>
                  <td>{p.qty}</td>
                  <td className="num">{formatAmount(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && parts.length === 0 && <p className="muted">No parts sold.</p>}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Jobs marked ready</h2>
            <button
              className="btn btn--sm"
              disabled={!ready.length}
              onClick={() => download(`jobs-ready-${stamp}.csv`, csv([['Person', 'Jobs marked ready'], ...ready.map((r) => [r.name, r.count])]), 'text/csv;charset=utf-8')}
            >
              CSV
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((r) => (
                <tr key={r.name}>
                  <th scope="row" style={{ fontWeight: 600 }}>{r.name}</th>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && ready.length === 0 && <p className="muted">No jobs marked ready.</p>}
        </section>
      </div>
      {inv && (inv.discount > 0 || inv.tax > 0) && (
        <p className="muted" style={{ fontSize: 13 }}>
          Invoiced includes {formatLKR(inv.tax)} tax after {formatLKR(inv.discount)} of discounts.
        </p>
      )}
    </div>
  );
}
