import { FirebaseError } from 'firebase/app';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { db } from '../../lib/firebase';
import { createStaffLogin, staffLoginError, temporaryPassword } from '../../lib/staffAccounts';
import { useOnline } from '../../lib/useOnline';
import { ROLE_LABEL, type Role } from '../../types';
import { ErrorAlert, Field, firstName, initials, StepError, StepIntro, useSave, type StepProps } from './shared';
import { useStaff } from './useStaff';

type StaffRole = Exclude<Role, 'owner'>;

const ROLES: { role: StaffRole; text: string }[] = [
  { role: 'manager', text: 'Everything except settings and staff' },
  { role: 'technician', text: 'Their jobs, notes and status' },
  { role: 'frontdesk', text: 'Customers, new jobs, payments' },
];

const CAN: [string, string, string, string][] = [
  ['Book in devices', 'Yes', '—', 'Yes'],
  ['Update job status', 'Yes', 'Own', '—'],
  ['Take payments', 'Yes', '—', 'Yes'],
  ['Quotes and invoices', 'Yes', '—', '—'],
  ['Inventory', 'Yes', 'View', 'View'],
  ['Reports', 'Yes', '—', '—'],
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Added {
  name: string;
  email: string;
  password: string;
}

export function StaffStep({ go }: StepProps) {
  const { user } = useSession();
  const { staff } = useStaff();
  const online = useOnline();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('technician');
  const [password, setPassword] = useState(temporaryPassword);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const { busy, error, run } = useSave();

  const errors = {
    name: name.trim() ? null : 'Enter their name.',
    email: EMAIL.test(email.trim()) ? null : 'Enter the email they will sign in with.',
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the password is visible to read out.
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.email) return;
    const person = { name: name.trim(), email: email.trim().toLowerCase(), password };
    void run(async () => {
      let uid: string;
      try {
        uid = await createStaffLogin(person.email, person.password);
      } catch (err) {
        throw new StepError(staffLoginError(err instanceof FirebaseError ? err.code : undefined));
      }
      await setDoc(doc(db, 'users', uid), {
        name: person.name,
        email: person.email,
        role,
        active: true,
        mustChangePassword: true,
      });
      setAdded(person);
      setName('');
      setEmail('');
      setPassword(temporaryPassword());
      setTouched(false);
    });
  }

  async function changeRole(uid: string, next: StaffRole) {
    setRoleError(null);
    try {
      await updateDoc(doc(db, 'users', uid), { role: next });
    } catch {
      setRoleError('Could not change the role. Check your connection and try again.');
    }
  }

  const others = staff.filter((s) => s.role !== 'owner');

  return (
    <div className="setup__grid">
      <div className="setup__main">
        <StepIntro title="Who works in the shop?">
          Each person gets their own sign-in, so the history shows who did what.
        </StepIntro>

        <div className="people">
          {staff.map((s) => (
            <div className="person" key={s.uid}>
              <span className="avatar">{initials(s.name)}</span>
              <span className="person__text">
                <strong>
                  {s.name}
                  {s.uid === user?.uid && ' (you)'}
                </strong>
                <span>{s.email}</span>
              </span>
              {s.role === 'owner' ? (
                <span className="badge">Owner</span>
              ) : (
                <select
                  aria-label={`Role for ${s.name}`}
                  value={s.role}
                  onChange={(e) => void changeRole(s.uid, e.target.value as StaffRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r.role} value={r.role}>
                      {ROLE_LABEL[r.role]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <ErrorAlert error={roleError} />

        {added && (
          <div className="alert alert--ok" role="status">
            <strong>{added.name} can now sign in</strong> with {added.email} and the temporary password{' '}
            <span className="mono" style={{ fontWeight: 700 }}>{added.password}</span>. Give it to them in person; they choose
            their own at first sign-in. This password is not shown again.
          </div>
        )}

        <form className="card stack" onSubmit={onAdd} noValidate style={{ background: 'var(--ground)' }}>
          <h2 className="section-title">Add a person</h2>
          <div className="form-grid">
            <Field id="staff-name" label="Name" error={shown('name')}>
              <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!shown('name')} autoComplete="off" />
            </Field>
            <Field id="staff-email" label="Email (used to sign in)" error={shown('email')}>
              <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!shown('email')} autoComplete="off" />
            </Field>
          </div>
          <fieldset className="choices">
            <legend>Role</legend>
            {ROLES.map((r) => (
              <label className="choice" key={r.role}>
                <input type="radio" name="role" checked={role === r.role} onChange={() => setRole(r.role)} />
                <strong>{ROLE_LABEL[r.role]}</strong>
                <span>{r.text}</span>
              </label>
            ))}
          </fieldset>
          <Field id="staff-pass" label="Temporary password" hint="Give them this password in person. They choose their own at first sign-in.">
            <div className="password-box">
              <input id="staff-pass" value={password} readOnly />
              <button type="button" className="btn" onClick={() => void copy()}>
                <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn" aria-label="New password" title="New password" onClick={() => setPassword(temporaryPassword())}>
                <Icon name="refresh" size={16} />
              </button>
            </div>
          </Field>
          <ErrorAlert error={!online ? 'You are offline. Adding staff needs the internet.' : error} />
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy || !online}>
              <Icon name="plus" size={16} /> {busy ? 'Adding…' : `Add ${firstName(name) || 'person'}`}
            </button>
          </div>
        </form>

        <div className="setup__actions">
          <button type="button" className="btn btn--ghost" onClick={() => go(3)}>
            <Icon name="arrowLeft" /> Back
          </button>
          <span className="spacer" />
          {others.length === 0 && (
            <button type="button" className="btn" onClick={() => go(5)}>
              Skip for now
            </button>
          )}
          <button type="button" className="btn btn--primary btn--lg" onClick={() => go(5)} disabled={others.length === 0}>
            Continue <Icon name="arrowRight" />
          </button>
        </div>
      </div>

      <aside className="setup__aside" aria-label="What each role can do">
        <h2 className="section-title">What each role can do</h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Task</span>
              </th>
              <th scope="col" title="Manager">Mgr</th>
              <th scope="col" title="Technician">Tech</th>
              <th scope="col" title="Front desk">Desk</th>
            </tr>
          </thead>
          <tbody>
            {CAN.map(([task, ...cells]) => (
              <tr key={task}>
                <th scope="row" style={{ fontWeight: 600 }}>{task}</th>
                {cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>
          Only the owner changes settings, adds staff or voids invoices.
        </p>
      </aside>
    </div>
  );
}
