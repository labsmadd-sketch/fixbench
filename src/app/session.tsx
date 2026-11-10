import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import { applyTheme, deriveTheme } from '../theme/brand';
import type { PublicShop, ShopSettings, StaffProfile } from '../types';

interface Session {
  loading: boolean;
  user: User | null;
  profile: StaffProfile | null;
  shop: ShopSettings | null;
  publicShop: PublicShop | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [publicShop, setPublicShop] = useState<PublicShop | null>(null);

  // Public branding: available before sign-in.
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'public'),
        (snap) => setPublicShop(snap.exists() ? (snap.data() as PublicShop) : null),
        () => setPublicShop(null),
      ),
    [],
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
        if (!u) {
          setProfile(null);
          setShop(null);
          setProfileReady(true);
        }
      }),
    [],
  );

  // Staff record and full shop settings, once signed in.
  useEffect(() => {
    if (!user) return;
    setProfileReady(false);
    const offProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as StaffProfile) : null);
        setProfileReady(true);
      },
      () => {
        setProfile(null);
        setProfileReady(true);
      },
    );
    const offShop = onSnapshot(
      doc(db, 'settings', 'shop'),
      (snap) => setShop(snap.exists() ? (snap.data() as ShopSettings) : null),
      () => setShop(null),
    );
    return () => {
      offProfile();
      offShop();
    };
  }, [user]);

  // Re-theme whenever the brand colour changes.
  const brand = shop?.brandColor ?? publicShop?.brandColor;
  useEffect(() => {
    applyTheme(deriveTheme(brand));
  }, [brand]);

  const value: Session = {
    loading: !authReady || (!!user && !profileReady),
    user,
    profile,
    shop,
    publicShop,
    signOut: () => signOut(auth),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}
