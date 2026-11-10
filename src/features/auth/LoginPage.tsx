import { FirebaseError } from 'firebase/app';
import { browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { auth } from '../../lib/firebase';

function messageFor(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match. Check both and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, or reset your password.';
    case 'auth/network-request-failed':
      return 'No internet connection. Signing in needs a connection.';
    default:
      return 'Could not sign in. Try again.';
  }
}

export function LoginPage() {
  const { user, publicShop } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    setError(null);
    if (!email.trim()) {
      setError('Type your email first, then choose “Forgot password?”.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      // Same message either way, so the form never reveals which emails exist.
    }
    setNotice('If that email has an account, a reset link is on its way.');
  }

  const shopName = publicShop?.name ?? 'Your repair shop';

  return (
    <div className="login">
      <section className="login__brand" aria-label="Shop">
        <div className="login__shop">
          {publicShop?.logo ? <img src={publicShop.logo} alt="" className="login__logo" /> : null}
          <span>{shopName}</span>
        </div>
        <h1 className="login__headline">Every job, from counter to collection.</h1>
        <p className="login__note">Staff accounts are created by the shop owner.</p>
      </section>

      <main className="login__main">
        <form className="login__form" onSubmit={onSubmit} noValidate>
          <div>
            <h2 className="h1">Sign in</h2>
            <p className="muted">Use the email your shop owner set up for you.</p>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <div className="field__row">
              <label htmlFor="password">Password</label>
              <button type="button" className="link-button" onClick={() => void onForgot()}>
                Forgot password?
              </button>
            </div>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this computer
          </label>
          <button className="btn btn--primary btn--lg" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          <p className="login__footer">FixBench</p>
        </form>
      </main>
    </div>
  );
}
