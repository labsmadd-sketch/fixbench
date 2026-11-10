import { FirebaseError } from 'firebase/app';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/session';
import { auth, db } from '../../lib/firebase';

const MIN_LENGTH = 8;

/** Shown instead of the app until someone given a temporary password sets their own. */
export function ChangePasswordPage() {
  const { user, profile, publicShop, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('The two passwords are different. Type them again.');
    if (!auth.currentUser || !user) return;
    setBusy(true);
    try {
      await updatePassword(auth.currentUser, password);
      await updateDoc(doc(db, 'users', user.uid), { mustChangePassword: false });
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : '';
      setError(
        code === 'auth/requires-recent-login'
          ? 'For safety, sign out and sign in again with the temporary password, then set your new one.'
          : code === 'auth/weak-password'
            ? 'That password is too easy to guess. Try a longer one.'
            : code === 'auth/network-request-failed'
              ? 'No connection. Changing your password needs the internet.'
              : 'Could not change the password. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login__main" style={{ flexBasis: '100%' }}>
        <form className="login__form" onSubmit={onSubmit} noValidate>
          <div className="stack" style={{ gap: 6 }}>
            <span className="badge">{publicShop?.name ?? 'FixBench'}</span>
            <h1 className="h1">Choose your password</h1>
            <p className="muted">
              Welcome{profile ? `, ${profile.name.split(' ')[0]}` : ''}. You signed in with a temporary password. Choose your own to
              continue; only you will know it.
            </p>
          </div>
          <div className="field">
            <label htmlFor="new-pass">New password</label>
            <input id="new-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="field__hint">At least {MIN_LENGTH} characters.</span>
          </div>
          <div className="field">
            <label htmlFor="confirm-pass">Type it again</label>
            <input id="confirm-pass" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
          <button className="link-button" type="button" onClick={() => void signOut()} style={{ alignSelf: 'center' }}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
