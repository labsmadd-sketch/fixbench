import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, Field } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { dateTime } from '../../lib/dates';
import { formatAmount, formatLKR, parseToCents } from '../../lib/money';
import { margin } from '../../lib/stock';
import { useQuery } from '../../lib/useFirestore';
import { STOCK_CATEGORIES, type InventoryItem, type StockMovement } from '../../types';
import { adjustStock, createItem, inventoryQuery, movementsQuery, REASON_LABEL, setActive, updateItem, type ItemInput, type ItemRow } from './data';

function toCsv(rows: ItemRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['SKU', 'Name', 'Category', 'Cost (LKR)', 'Price (LKR)', 'In stock', 'Reorder at', 'Active'];
  return [
    head.map(esc).join(','),
    ...rows.map((i) => [i.sku, i.name, i.category, (i.cost / 100).toFixed(2), (i.price / 100).toFixed(2), i.qty, i.lowStockAt, i.active ? 'yes' : 'no'].map(esc).join(',')),
  ].join('\r\n');
}

/** /inventory — everyone can view; managers add items and adjust stock. */
export function InventoryPage() {
  const { profile } = useSession();
  const isManager = profile?.role === 'owner' || profile?.role === 'manager';
  const [params, setParams] = useSearchParams();
  const all = useQuery<InventoryItem>(inventoryQuery(), 'inventory-all');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const filter = params.get('f') ?? 'all';
  const selectedId = params.get('item');

  const active = all.data.filter((i) => i.active || filter === 'inactive');
  const lowCount = all.data.filter((i) => i.active && i.low).length;
  const value = all.data.filter((i) => i.active).reduce((s, i) => s + i.cost * i.qty, 0);
  const categories = [...new Set(all.data.filter((i) => i.active).map((i) => i.category))].sort();

  const t = text.trim().toLowerCase();
  const rows = useMemo(
    () =>
      active.filter(
        (i) =>
          (filter === 'all' ? true : filter === 'low' ? i.low : filter === 'inactive' ? !i.active : i.category === filter) &&
          (!t || i.name.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t)),
      ),
    [active, filter, t],
  );
  const selected = all.data.find((i) => i.id === selectedId) ?? null;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  function exportCsv() {
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="page-head">
        <div style={{ marginRight: 'auto' }}>
          <h1 className="h1">Inventory</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {all.data.filter((i) => i.active).length} items · stock value {formatLKR(value)} at cost
          </p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
        {isManager && (
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add item
          </button>
        )}
      </div>

      <div className="toolbar">
        <input className="select" style={{ flex: '1 1 220px', maxWidth: 320 }} type="search" placeholder="Search name or SKU" aria-label="Search inventory" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="Filter">
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setParam('f', null)}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} className="chip" aria-pressed={filter === c} onClick={() => setParam('f', c)}>
            {c}
          </button>
        ))}
        <button className={`chip${lowCount ? ' chip--alert' : ''}`} aria-pressed={filter === 'low'} onClick={() => setParam('f', 'low')}>
          Low stock · {lowCount}
        </button>
        {isManager && (
          <button className="chip" aria-pressed={filter === 'inactive'} onClick={() => setParam('f', 'inactive')}>
            Inactive
          </button>
        )}
      </div>

      <div className="detail">
        <div className="detail__main">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="hide-sm">Category</th>
                  <th className="right hide-sm">Cost</th>
                  <th className="right">Price</th>
                  <th className="right">In stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} onClick={() => setParam('item', i.id)} aria-selected={i.id === selectedId} style={i.id === selectedId ? { background: 'var(--brand-soft)' } : undefined}>
                    <td>
                      <strong>{i.name}</strong>
                      <span className="sub num">{i.sku}</span>
                    </td>
                    <td className="hide-sm">{i.category}</td>
                    <td className="right num hide-sm">{formatAmount(i.cost)}</td>
                    <td className="right num">{formatAmount(i.price)}</td>
                    <td className="right">
                      <strong className={`num ${i.low ? 'danger-text' : ''}`}>{i.qty}</strong>
                      {i.low && <span className="sub">Reorder at {i.lowStockAt}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && !all.loading && (
            <div className="empty">
              <Icon name="box" size={28} />
              <strong>{all.data.length === 0 ? 'No stock items yet' : 'Nothing matches'}</strong>
              {all.data.length === 0 && isManager && <span>Add the parts and accessories you keep on the shelf.</span>}
            </div>
          )}
        </div>

        <aside className="detail__side">
          {selected ? (
            <ItemPanel key={selected.id} item={selected} isManager={isManager} />
          ) : (
            <section className="panel empty">
              <span>Choose an item to see its margin and stock history.</span>
            </section>
          )}
        </aside>
      </div>

      {adding && <ItemDialog onClose={() => setAdding(false)} onSaved={(id) => setParam('item', id)} />}
    </div>
  );
}

function ItemPanel({ item, isManager }: { item: ItemRow; isManager: boolean }) {
  const { profile, user } = useSession();
  const moves = useQuery<StockMovement>(movementsQuery(item.id), `moves-${item.id}`);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<'received' | 'damaged' | 'count'>('received');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = margin(item.cost, item.price);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0 || (reason !== 'count' && n === 0)) return setError('Enter a whole number.');
    setBusy(true);
    setError(null);
    try {
      await adjustStock(item.id, reason, n, note, { uid: user?.uid ?? '', name: profile?.name ?? '' });
      setQty('');
      setNote('');
    } catch (x) {
      setError(x instanceof Error && x.message.startsWith('Only') ? x.message : 'Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>{item.name}</h2>
          {isManager && (
            <button className="link-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        <span className="muted num" style={{ fontSize: 12 }}>
          {item.sku} · {item.category}
          {!item.active && ' · inactive'}
        </span>
        <div className="kv">
          <span>Margin</span>
          <strong className="num">
            {formatLKR(m.amount)} ({m.percent}%)
          </strong>
        </div>
        <div className="kv">
          <span>In stock</span>
          <strong className={item.low ? 'danger-text' : undefined}>
            {item.qty} {item.low ? `· reorder at ${item.lowStockAt}` : ''}
          </strong>
        </div>
      </section>

      {isManager && item.active && (
        <form className="panel" onSubmit={onAdjust} noValidate>
          <h2>Adjust stock</h2>
          <fieldset className="choices" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <legend className="sr-only">Reason</legend>
            {(['received', 'damaged', 'count'] as const).map((r) => (
              <label className="choice" key={r} style={{ padding: '10px 8px' }}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                <strong style={{ fontSize: 13 }}>{r === 'received' ? 'Received' : r === 'damaged' ? 'Damaged' : 'Count'}</strong>
              </label>
            ))}
          </fieldset>
          <Field id="adj-qty" label={reason === 'count' ? 'Counted on the shelf' : 'Quantity'}>
            <input id="adj-qty" inputMode="numeric" className="num" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="adj-note" label="Note" optional>
            <input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === 'received' ? 'Supplier or bill no.' : ''} />
          </Field>
          <ErrorAlert error={error} />
          <button className="btn btn--primary" type="submit" disabled={busy || !qty}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <section className="panel">
        <h2>Movements</h2>
        {moves.data.length === 0 && <p className="muted">No movements yet.</p>}
        {moves.data.map((mv) => (
          <div className="paper__row" key={mv.id} style={{ alignItems: 'baseline' }}>
            <span className="kv">
              <strong style={{ fontSize: 13 }}>
                {REASON_LABEL[mv.reason]}
                {mv.invoiceNo ? ` · ${mv.invoiceNo}` : ''}
              </strong>
              <span>
                {dateTime(mv.at)} · {mv.byName.split(' ')[0]}
                {mv.note ? ` · ${mv.note}` : ''}
              </span>
            </span>
            <span className={`num ${mv.delta < 0 ? 'danger-text' : ''}`}>
              {mv.delta > 0 ? '+' : '−'}
              {Math.abs(mv.delta)}
            </span>
          </div>
        ))}
      </section>

      {isManager && (
        <button className="btn btn--ghost" onClick={() => void setActive(item.id, !item.active)}>
          {item.active ? 'Deactivate (hide from sale)' : 'Make active again'}
        </button>
      )}
      {editing && <ItemDialog item={item} onClose={() => setEditing(false)} onSaved={() => undefined} />}
    </>
  );
}

function ItemDialog({ item, onClose, onSaved }: { item?: ItemRow; onClose: () => void; onSaved: (id: string) => void }) {
  const { profile, user } = useSession();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => closeRef.current();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, []);

  const [f, setF] = useState({
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    category: item?.category ?? STOCK_CATEGORIES[0],
    cost: item ? String(item.cost / 100) : '',
    price: item ? String(item.price / 100) : '',
    lowStockAt: item ? String(item.lowStockAt) : '2',
    opening: '',
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const cost = parseToCents(f.cost);
  const price = parseToCents(f.price);
  const low = Number(f.lowStockAt);
  const opening = f.opening.trim() ? Number(f.opening) : 0;
  const errors = {
    name: f.name.trim() ? null : 'Enter a name.',
    sku: f.sku.trim() ? null : 'Enter a SKU or short code.',
    cost: cost === null || cost < 0 ? 'Enter the cost.' : null,
    price: price === null || price < 0 ? 'Enter the selling price.' : null,
    low: Number.isInteger(low) && low >= 0 ? null : 'Whole number.',
    opening: Number.isInteger(opening) && opening >= 0 ? null : 'Whole number.',
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const input: ItemInput = { name: f.name, sku: f.sku, category: f.category, cost: cost!, price: price!, lowStockAt: low };
    setBusy(true);
    setError(null);
    try {
      if (item) await updateItem(item.id, input);
      else onSaved(await createItem(input, opening, { uid: user?.uid ?? '', name: profile?.name ?? '' }));
      ref.current?.close();
    } catch {
      setError('Could not save. Check your connection.');
      setBusy(false);
    }
  }

  return (
    <dialog className="dialog" ref={ref} style={{ width: 'min(560px, calc(100vw - 32px))' }}>
      <form onSubmit={onSubmit} noValidate>
        <h2>{item ? 'Edit item' : 'Add a stock item'}</h2>
        <div className="form-grid">
          <Field id="it-name" label="Name" error={shown('name')} className="span-2">
            <input id="it-name" value={f.name} onChange={set('name')} placeholder="SSD 512 GB NVMe" autoFocus />
          </Field>
          <Field id="it-sku" label="SKU" error={shown('sku')}>
            <input id="it-sku" value={f.sku} onChange={set('sku')} className="mono" placeholder="SSD-512-NV" />
          </Field>
          <Field id="it-cat" label="Category">
            <select id="it-cat" value={f.category} onChange={set('category')}>
              {[...new Set([...STOCK_CATEGORIES, f.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field id="it-cost" label="Cost (LKR)" error={shown('cost')}>
            <input id="it-cost" inputMode="decimal" className="num" value={f.cost} onChange={set('cost')} />
          </Field>
          <Field id="it-price" label="Selling price (LKR)" error={shown('price')}>
            <input id="it-price" inputMode="decimal" className="num" value={f.price} onChange={set('price')} />
          </Field>
          <Field id="it-low" label="Reorder at" error={shown('low')} hint="Shown as low stock at or below this.">
            <input id="it-low" inputMode="numeric" className="num" value={f.lowStockAt} onChange={set('lowStockAt')} />
          </Field>
          {!item && (
            <Field id="it-open" label="In stock now" optional error={shown('opening')}>
              <input id="it-open" inputMode="numeric" className="num" value={f.opening} onChange={set('opening')} placeholder="0" />
            </Field>
          )}
        </div>
        {item && <p className="muted" style={{ fontSize: 12 }}>To change the quantity, use Adjust stock so the history stays complete.</p>}
        <ErrorAlert error={error} />
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save' : 'Add item'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
