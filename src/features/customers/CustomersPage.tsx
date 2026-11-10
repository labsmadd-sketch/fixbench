import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { initials } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { useSession } from '../../app/session';
import { db } from '../../lib/firebase';
import { parseCustomerQuery } from '../../lib/search';
import { useDebounced } from '../../lib/useDebounced';
import { useQuery } from '../../lib/useFirestore';
import type { Customer } from '../../types';
import { searchCustomers, type CustomerRow } from './data';

const recentQuery = () => query(collection(db, 'customers'), orderBy('updatedAt', 'desc'), limit(20));

/** /customers — search list beside the selected customer. */
export function CustomersPage() {
  const { profile } = useSession();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text, 250);
  const [results, setResults] = useState<CustomerRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const recent = useQuery<Customer>(recentQuery(), 'recent-customers');
  const canAdd = profile?.role !== 'technician';
  const location = useLocation();

  // A search typed in the top bar while this page is open.
  const topbarSearch = (location.state as { search?: number } | null)?.search;
  useEffect(() => {
    if (topbarSearch) setText(params.get('q') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topbarSearch]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    if (parseCustomerQuery(q).kind === 'none') {
      setResults(null);
      return;
    }
    let live = true;
    setSearching(true);
    searchCustomers(q)
      .then((r) => live && setResults(r))
      .catch(() => live && setResults([]))
      .finally(() => live && setSearching(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = results ?? recent.data;
  const search = params.get('q') ? `?q=${encodeURIComponent(params.get('q')!)}` : '';
  const digits = text.replace(/\D/g, '');

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Customers</h1>
        {canAdd && (
          <Link to={`/customers/new${digits.length >= 9 ? `?phone=${digits}` : ''}`} className="btn btn--primary">
            <Icon name="plus" /> Add customer
          </Link>
        )}
      </div>
      <div className="split">
        <section className="split__list" aria-label="Customer search" style={id ? undefined : undefined}>
          <div className="split__search">
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Phone or name"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus={!id}
            />
            <span className="split__hint" aria-live="polite">
              {searching
                ? 'Searching…'
                : results
                  ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${q.trim()}”`
                  : 'Recently updated'}
            </span>
          </div>
          <div>
            {list.map((c) => (
              <NavLink key={c.id} to={`/customers/${c.id}${search}`} className="result">
                <span className="avatar">{initials(c.name)}</span>
                <span className="result__text">
                  <strong>{c.type === 'business' && c.companyName ? `${c.companyName}` : c.name}</strong>
                  <span>
                    {c.type === 'business' && c.companyName ? `${c.name} · ` : ''}
                    {c.phone}
                    {c.address?.city ? ` · ${c.address.city}` : ''}
                  </span>
                </span>
              </NavLink>
            ))}
            {results && results.length === 0 && !searching && (
              <div className="empty">
                <strong>No customer found</strong>
                {canAdd && (
                  <Link className="btn btn--sm" to={`/customers/new${digits.length >= 9 ? `?phone=${digits}` : ''}`}>
                    Add a new customer
                  </Link>
                )}
              </div>
            )}
            {!results && !recent.loading && recent.data.length === 0 && (
              <div className="empty">
                <strong>No customers yet</strong>
                <span>They are added when you book in a device.</span>
              </div>
            )}
          </div>
        </section>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function NoCustomerSelected() {
  return (
    <div className="panel empty" style={{ minHeight: 240, justifyContent: 'center' }}>
      <Icon name="users" size={28} />
      <strong>Find a customer</strong>
      <span>Type a phone number (any format) or part of a name.</span>
    </div>
  );
}
