import { getDocs } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { lowStockQuery } from '../features/inventory/data';
import { ticketByNumberQuery } from '../features/tickets/data';
import { useQuery } from '../lib/useFirestore';
import type { InventoryItem } from '../types';
import { looksLikeTicketNo } from '../lib/search';
import { useOnline } from '../lib/useOnline';
import { ROLE_LABEL, type Role } from '../types';
import { Icon, type IconName } from '../components/Icon';
import { useSession } from './session';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/tickets', label: 'Service tickets', icon: 'wrench' },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/quotes', label: 'Quotes', icon: 'file' },
  { to: '/invoices', label: 'Invoices and sales', icon: 'receipt', roles: ['owner', 'manager', 'frontdesk'] },
  { to: '/inventory', label: 'Inventory', icon: 'box' },
  { to: '/reports', label: 'Reports', icon: 'chart', roles: ['owner', 'manager'] },
  { to: '/settings', label: 'Settings', icon: 'sliders', roles: ['owner'] },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Layout() {
  const { profile, shop, signOut } = useSession();
  const online = useOnline();
  const role = profile?.role;
  const shopName = shop?.name ?? 'Your shop';
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const low = useQuery<InventoryItem>(lowStockQuery(), 'low-stock');

  // A ticket number opens that ticket; anything else searches customers.
  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (looksLikeTicketNo(q)) {
      const snap = await getDocs(ticketByNumberQuery(q.toUpperCase())).catch(() => null);
      if (snap && !snap.empty) {
        setSearch('');
        return navigate(`/tickets/${snap.docs[0].id}`);
      }
    }
    navigate(`/customers?q=${encodeURIComponent(q)}`, { state: { search: Date.now() } });
    setSearch('');
  }

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar__brand">
          {shop?.logo ? (
            <img className="sidebar__logo" src={shop.logo} alt="" />
          ) : (
            <span className="sidebar__logo sidebar__logo--initials">{initials(shopName)}</span>
          )}
          <span className="sidebar__shop">{shopName}</span>
        </div>
        {NAV.filter((n) => !n.roles || (role && n.roles.includes(role))).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="sidebar__link">
            <Icon name={n.icon} />
            {n.label}
            {n.to === '/inventory' && low.data.length > 0 && <span className="sidebar__badge">{low.data.length} low</span>}
          </NavLink>
        ))}
        <div className="sidebar__spacer" />
        {profile && (
          <div className="sidebar__me">
            <span className="avatar">{initials(profile.name)}</span>
            <span className="sidebar__me-text">
              <strong>{profile.name}</strong>
              <span>{ROLE_LABEL[profile.role]}</span>
            </span>
            <button className="sidebar__signout" onClick={() => void signOut()} aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        )}
      </nav>

      <div className="main">
        <header className="topbar">
          <form className="search" role="search" onSubmit={(e) => void onSearch(e)}>
            <Icon name="search" />
            <input
              aria-label="Search customers or a ticket number"
              placeholder="Search phone, name or ticket no."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          {online ? (
            <span className="pill pill--ok">
              <span className="dot" />
              Online
            </span>
          ) : (
            <span className="pill pill--warn" role="status">
              <span className="dot" />
              Offline — new tickets and invoices wait until you reconnect
            </span>
          )}
          {role !== 'technician' && (
            <NavLink to="/tickets/new" className="btn btn--primary">
              <Icon name="plus" />
              New ticket
            </NavLink>
          )}
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
