import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RequireRole } from '../../app/guards';
import { useSession } from '../../app/session';
import { db } from '../../lib/firebase';

const STEPS = ['Shop details', 'Logo and colours', 'Tax and numbering', 'Add staff', 'Ready'];

/**
 * First-run wizard. Phase 5 builds the five steps from the design canvas;
 * for now the owner can finish setup so the rest of the app is reachable.
 */
export function SetupPage() {
  const { shop } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await setDoc(doc(db, 'settings', 'shop'), { setupComplete: true, updatedAt: serverTimestamp() }, { merge: true });
      navigate('/', { replace: true });
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole roles={['owner']}>
      <div className="setup">
        <ol className="setup__steps" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === 0 ? 'step' : undefined}>
              <span className="setup__bar" />
              {i + 1} · {s}
            </li>
          ))}
        </ol>
        <section className="card stack setup__card">
          <h1 className="h1">Set up {shop?.name ?? 'your shop'}</h1>
          <p className="muted">
            The full five-step wizard arrives in Phase 5. Until then, shop details come from the seed or setup script, and you
            can finish setup to use the app.
          </p>
          <div>
            <button className="btn btn--primary btn--lg" onClick={() => void finish()} disabled={busy}>
              {busy ? 'Saving…' : 'Finish setup'}
            </button>
          </div>
          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}
        </section>
      </div>
    </RequireRole>
  );
}
