import { useMemo, useState } from 'react';
import { formatAmount, parseToCents } from '../../lib/money';
import { useQuery } from '../../lib/useFirestore';
import type { InventoryItem, InvoiceItem } from '../../types';
import { inventoryQuery, type ItemRow } from '../inventory/data';

export interface EditLine {
  key: number;
  description: string;
  kind: InvoiceItem['kind'];
  qty: string;
  price: string;
  inventoryId?: string;
  optional?: boolean;
}

let nextKey = 1;
export const newLine = (l: Partial<EditLine> = {}): EditLine => ({ key: nextKey++, description: '', kind: 'labour', qty: '1', price: '', ...l });

export function linesFromItems(items: (InvoiceItem & { optional?: boolean })[]): EditLine[] {
  return items.map((i) => newLine({ description: i.description, kind: i.kind, qty: String(i.qty), price: String(i.unitPrice / 100), inventoryId: i.inventoryId, optional: i.optional }));
}

/** Live catalogue for the picker and stock checks. */
export function useStock() {
  const q = useQuery<InventoryItem>(inventoryQuery(), 'inventory-all');
  const byId = useMemo(() => new Map(q.data.map((i) => [i.id, i])), [q.data]);
  return { items: q.data, byId };
}

/** Parse and check every line. Stock lines need whole units and enough on the shelf. */
export function checkLines(lines: EditLine[], stock: Map<string, ItemRow>) {
  const wanted = new Map<string, number>();
  for (const l of lines) if (l.inventoryId) wanted.set(l.inventoryId, (wanted.get(l.inventoryId) ?? 0) + Number(l.qty));
  const parsed = lines.map((l) => {
    const qty = Number(l.qty);
    const cents = parseToCents(l.price);
    const item = l.inventoryId ? stock.get(l.inventoryId) : undefined;
    const error = !l.description.trim()
      ? 'Describe the item.'
      : !(qty > 0 && qty <= 1000)
        ? 'Check the quantity.'
        : l.inventoryId && !Number.isInteger(qty)
          ? 'Stock items are sold in whole units.'
          : cents === null || cents < 0
            ? 'Enter a price.'
            : item && (wanted.get(item.id) ?? 0) > item.qty
              ? `Only ${item.qty} in stock.`
              : null;
    return { l, qty, cents, item, error };
  });
  const items = parsed
    .filter((p) => !p.error)
    .map(({ l, qty, cents }) => ({
      description: l.description.trim(),
      kind: l.kind,
      qty,
      unitPrice: cents ?? 0,
      ...(l.inventoryId ? { inventoryId: l.inventoryId } : {}),
      ...(l.optional !== undefined ? { optional: !!l.optional } : {}),
    }));
  return { parsed, items, invalid: parsed.some((p) => p.error) || lines.length === 0 };
}

export function LineItems({
  lines,
  setLines,
  touched,
  stock,
  withOptional,
  checkStock = true,
}: {
  lines: EditLine[];
  setLines: (f: (ls: EditLine[]) => EditLine[]) => void;
  touched: boolean;
  stock: { items: ItemRow[]; byId: Map<string, ItemRow> };
  /** Quotes: each line can be marked optional. */
  withOptional?: boolean;
  /** Quotes do not reserve stock, so they only show the level. */
  checkStock?: boolean;
}) {
  const { parsed } = checkLines(lines, checkStock ? stock.byId : new Map());
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const update = (key: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const s = search.trim().toLowerCase();
  const matches = stock.items
    .filter((i) => i.active && (!s || i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s)))
    .slice(0, 8);

  return (
    <>
      <div className="lines">
        {lines.map((l, i) => {
          const p = parsed[i];
          const item = l.inventoryId ? stock.byId.get(l.inventoryId) : undefined;
          return (
            <div className="line" key={l.key}>
              <div className="field line__desc">
                <label htmlFor={`d-${l.key}`} className={i ? 'sr-only' : undefined}>Description</label>
                <input id={`d-${l.key}`} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} aria-invalid={touched && !!p.error} placeholder="DC power jack with cable" />
              </div>
              <div className="field">
                <label htmlFor={`k-${l.key}`} className={i ? 'sr-only' : undefined}>Type</label>
                <select id={`k-${l.key}`} value={l.kind} onChange={(e) => update(l.key, { kind: e.target.value as InvoiceItem['kind'] })} disabled={!!l.inventoryId}>
                  <option value="part">Part</option>
                  <option value="labour">Labour</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field line__qty">
                <label htmlFor={`q-${l.key}`} className={i ? 'sr-only' : undefined}>Qty</label>
                <input id={`q-${l.key}`} inputMode="decimal" className="num" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`p-${l.key}`} className={i ? 'sr-only' : undefined}>Unit price</label>
                <input id={`p-${l.key}`} inputMode="decimal" className="num" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} aria-invalid={touched && p.cents === null} />
              </div>
              <span className="line__amount num">{p.cents !== null && p.qty > 0 ? formatAmount(Math.round(p.cents * p.qty)) : '—'}</span>
              <button type="button" className="btn btn--ghost btn--sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
                ✕
              </button>
              {(item || withOptional) && (
                <span className="line__meta">
                  {item && (
                    <span className={item.qty === 0 ? 'danger-text' : undefined}>
                      From stock · {item.sku} · {item.qty} in stock
                    </span>
                  )}
                  {withOptional && (
                    <label className="check" style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={!!l.optional} onChange={(e) => update(l.key, { optional: e.target.checked })} />
                      Optional (customer can choose)
                    </label>
                  )}
                </span>
              )}
              {touched && p.error && <span className="field__error line__error">{p.error}</span>}
            </div>
          );
        })}
      </div>

      <div className="toggles">
        <button type="button" className="toggle toggle--add" aria-pressed={picking} onClick={() => setPicking((x) => !x)}>
          + From stock
        </button>
        <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, newLine({ kind: 'part' })])}>
          + Part
        </button>
        <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, newLine({ kind: 'labour' })])}>
          + Labour
        </button>
        <button type="button" className="toggle toggle--add" onClick={() => setLines((ls) => [...ls, newLine({ kind: 'other' })])}>
          + Other
        </button>
      </div>

      {picking && (
        <div className="picker">
          <input className="select" type="search" autoFocus placeholder="Search stock by name or SKU" aria-label="Search stock" value={search} onChange={(e) => setSearch(e.target.value)} />
          {matches.length === 0 && <p className="muted">No stock items match.</p>}
          {matches.map((item) => (
            <button
              type="button"
              key={item.id}
              className="picker__item"
              disabled={checkStock && item.qty === 0}
              onClick={() => {
                // Remove an empty first line so picking from stock feels like "add".
                setLines((ls) => [
                  ...ls.filter((x) => x.description.trim() || x.price.trim()),
                  newLine({ description: item.name, kind: 'part', price: String(item.price / 100), inventoryId: item.id }),
                ]);
                setPicking(false);
                setSearch('');
              }}
            >
              <span>
                <strong>{item.name}</strong>
                <span className="muted"> · {item.sku}</span>
              </span>
              <span className={item.qty === 0 ? 'danger-text' : 'muted'}>
                {item.qty} in stock · {formatAmount(item.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
