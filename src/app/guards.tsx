import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../types';
import { useSession } from './session';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="full-page-message">{children}</div>;
}

/** Signed in, with an active staff record. Sends owners to setup until it is done. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { loading, user, profile, shop, signOut } = useSession();
  const location = useLocation();

  if (loading) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile || !profile.active) {
    return (
      <FullPageMessage>
        <h1>This account is turned off</h1>
        <p>Ask the shop owner to turn it back on.</p>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </FullPageMessage>
    );
  }
  if (profile.role === 'owner' && !shop?.setupComplete && !location.pathname.startsWith('/setup')) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}

/** Hide a page from roles that cannot use it. Security rules enforce the same. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useSession();
  if (!profile || !roles.includes(profile.role)) {
    return (
      <FullPageMessage>
        <h1>Not available for your role</h1>
        <p>Ask a manager or the shop owner if you need access.</p>
      </FullPageMessage>
    );
  }
  return <>{children}</>;
}
