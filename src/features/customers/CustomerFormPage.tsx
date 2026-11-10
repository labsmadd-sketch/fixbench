import { doc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorAlert, Field, initials } from '../../components/Form';
import { db } from '../../lib/firebase';
import { formatPhone, isValidLocalPhone } from '../../lib/phone';
import { useDebounced } from '../../lib/useDebounced';
import { useDoc } from '../../lib/useFirestore';
import type { Customer, PreferredContact } from '../../types';
import { addOtherPhone, findByPhone, findSimilarName, saveCustomer, type CustomerInput, type CustomerRow } from './data';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONTACT: { value: PreferredContact; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Phone call' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

const EMPTY: CustomerInput = {
  type: 'individual',
  name: '',
  companyName: '',
  phone: '',
  secondPhone: '',
  email: '',
  street: '',
  city: '',
  tin: '',
  preferredContact: 'whatsapp',
  whatsappConsent: true,
  notes: '',
};

function fromCustomer(c: Customer): CustomerInput {
  return {
    type: c.type,
    name: c.name,
    companyName: c.companyName ?? '',
    phone: c.phone,
    secondPhone: c.secondPhone ?? '',
    email: c.email ?? '',
    street: c.address?.street ?? '',
    city: c.address?.city ?? '',
    tin: c.tin ?? '',
    preferredContact: c.preferredContact,
    whatsappConsent: c.whatsappConsent,
    notes: c.notes ?? '',
  };
}

/** /customers/new (optionally ?phone=…&next=ticket) and /customers/:id/edit */
export function CustomerFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useDoc<Customer>(id ? doc(db, 'customers', id) : null, id ?? '');

  if (id && existing.loading) return <p className="muted">Loading…</p>;
  if (id && !existing.data) return <p className="muted">This customer no longer exists.</p>;

  return (
    <CustomerForm
      key={id ?? 'new'}
      id={id ?? null}
      initial={existing.data ? fromCustomer(existing.data) : { ...EMPTY, phone: params.get('phone') ?? '' }}
      bookAfter={params.get('next') === 'ticket'}
      onDone={(cid, book) => navigate(book ? `/tickets/new?customer=${cid}` : `/customers/${cid}`, { replace: true })}
    />
  );
}

function CustomerForm({
  id,
  initial,
  bookAfter,
  onDone,
}: {
  id: string | null;
  initial: CustomerInput;
  bookAfter: boolean;
  onDone: (id: string, book: boolean) => void;
}) {
  const [f, setF] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samePhone, setSamePhone] = useState<CustomerRow[] | null>(null);
  const [similar, setSimilar] = useState<CustomerRow[]>([]);

  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof CustomerInput) => (e: { target: { value: string } }) => set(k, e.target.value as never);

  // Live checks: is this number already a customer? Is there someone with a similar name?
  const phone = useDebounced(f.phone, 350);
  const name = useDebounced(f.name, 450);
  useEffect(() => {
    if (!isValidLocalPhone(phone)) return setSamePhone(null);
    let live = true;
    findByPhone(phone, id ?? undefined).then((r) => live && setSamePhone(r), () => live && setSamePhone(null));
    return () => {
      live = false;
    };
  }, [phone, id]);
  useEffect(() => {
    if (id) return; // only when adding
    let live = true;
    findSimilarName(name).then((r) => live && setSimilar(r), () => live && setSimilar([]));
    return () => {
      live = false;
    };
  }, [name, id]);

  const errors = {
    phone: !f.phone.trim() ? 'Enter a mobile number.' : isValidLocalPhone(f.phone) ? null : 'Use a 10-digit number, like 077 123 4567.',
    secondPhone: f.secondPhone.trim() && !isValidLocalPhone(f.secondPhone) ? 'Use a 10-digit number.' : null,
    name: f.name.trim() ? null : 'Enter the customer’s name.',
    companyName: f.type === 'business' && !f.companyName.trim() ? 'Enter the company name.' : null,
    email: f.email.trim() && !EMAIL.test(f.email.trim()) ? 'Enter a full email address, like name@example.com.' : f.preferredContact === 'email' && !f.email.trim() ? 'Add an email to send updates by email.' : null,
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const invalid = Object.values(errors).some(Boolean);
  const duplicate = samePhone && samePhone.length > 0 ? samePhone[0] : null;

  async function save(book: boolean) {
    setTouched(true);
    if (invalid) return;
    if (duplicate) {
      setError(`${duplicate.name} already has this number. Open their record instead, or change the number.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cid = await saveCustomer(id, f);
      onDone(cid, book);
    } catch {
      setError('Could not save. Check your connection and try again.');
      setBusy(false);
    }
  }

  async function pickExisting(c: CustomerRow) {
    setBusy(true);
    try {
      if (isValidLocalPhone(f.phone)) await addOtherPhone(c, f.phone);
      onDone(c.id, bookAfter);
    } catch {
      setError('Could not update that customer. Try again.');
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(bookAfter);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="crumbs">
        <Link to="/customers">Customers</Link> / {id ? 'Edit' : 'New'}
      </p>
      <div className="page-head">
        <h1 className="h1">{id ? `Edit ${initial.name}` : 'New customer'}</h1>
        <span className="muted">Only phone and name are required</span>
      </div>

      <div className="detail">
        <div className="detail__main">
          <section className="panel">
            <h2>Contact</h2>
            <div className="form-grid">
              <Field
                id="c-phone"
                label="Mobile number"
                error={shown('phone')}
                hint={
                  duplicate ? undefined : samePhone && samePhone.length === 0 ? 'No customer has this number yet' : undefined
                }
              >
                <input id="c-phone" type="tel" inputMode="tel" autoFocus={!id} value={f.phone} onChange={text('phone')} aria-invalid={!!shown('phone') || !!duplicate} />
              </Field>
              <Field id="c-phone2" label="Other phone" optional error={shown('secondPhone')}>
                <input id="c-phone2" type="tel" inputMode="tel" value={f.secondPhone} onChange={text('secondPhone')} aria-invalid={!!shown('secondPhone')} />
              </Field>
            </div>
            {duplicate && (
              <div className="alert alert--warn" role="status">
                <strong>{duplicate.name}</strong> already has {formatPhone(f.phone)}.{' '}
                <Link to={`/customers/${duplicate.id}`}>Open their record</Link>
                {' · '}
                <Link to={`/tickets/new?customer=${duplicate.id}`}>Book in a device for them</Link>
              </div>
            )}

            <fieldset className="choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <legend>Customer type</legend>
              <label className="choice">
                <input type="radio" name="ctype" checked={f.type === 'individual'} onChange={() => set('type', 'individual')} />
                <strong>Individual</strong>
              </label>
              <label className="choice">
                <input type="radio" name="ctype" checked={f.type === 'business'} onChange={() => set('type', 'business')} />
                <strong>Business</strong>
              </label>
            </fieldset>

            <div className="form-grid">
              <Field id="c-name" label={f.type === 'business' ? 'Contact person' : 'Full name'} error={shown('name')} className={f.type === 'business' ? '' : 'span-2'}>
                <input id="c-name" value={f.name} onChange={text('name')} autoComplete="off" aria-invalid={!!shown('name')} />
              </Field>
              {f.type === 'business' && (
                <Field id="c-company" label="Company name" error={shown('companyName')}>
                  <input id="c-company" value={f.companyName} onChange={text('companyName')} aria-invalid={!!shown('companyName')} />
                </Field>
              )}
              <Field id="c-email" label="Email" optional hint="For emailed invoices" error={shown('email')}>
                <input id="c-email" type="email" value={f.email} onChange={text('email')} aria-invalid={!!shown('email')} />
              </Field>
              <Field id="c-tin" label="TIN" optional hint="Printed on tax invoices. Usually needed for VAT-registered business customers.">
                <input id="c-tin" value={f.tin} onChange={text('tin')} inputMode="numeric" />
              </Field>
              <Field id="c-street" label="Street" optional>
                <input id="c-street" value={f.street} onChange={text('street')} />
              </Field>
              <Field id="c-city" label="Town or city" optional>
                <input id="c-city" value={f.city} onChange={text('city')} />
              </Field>
            </div>
          </section>

          <section className="panel">
            <h2>Updates and notes</h2>
            <fieldset className="choices" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <legend>Best way to reach them</legend>
              {CONTACT.map((c) => (
                <label className="choice" key={c.value}>
                  <input type="radio" name="contact" checked={f.preferredContact === c.value} onChange={() => set('preferredContact', c.value)} />
                  <strong>{c.label}</strong>
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={f.whatsappConsent} onChange={(e) => set('whatsappConsent', e.target.checked)} />
              Customer agrees to get repair updates and receipts on WhatsApp
            </label>
            <Field id="c-notes" label="Notes for staff" hint="Not shown to the customer.">
              <textarea id="c-notes" className="compact" value={f.notes} onChange={text('notes')} rows={2} />
            </Field>
          </section>

          <ErrorAlert error={touched && invalid ? 'Fix the highlighted fields to save.' : error} />

          <div className="setup__actions" style={{ marginTop: 0 }}>
            <Link to={id ? `/customers/${id}` : '/customers'} className="btn btn--ghost">
              Cancel
            </Link>
            <span className="spacer" />
            <button type="button" className={bookAfter ? 'btn' : 'btn btn--primary'} disabled={busy} onClick={() => void save(false)}>
              Save customer
            </button>
            {!id && (
              <button type="button" className={bookAfter ? 'btn btn--primary' : 'btn'} disabled={busy} onClick={() => void save(true)}>
                Save and book in a device
              </button>
            )}
          </div>
        </div>

        <aside className="detail__side">
          {similar.length > 0 && (
            <section className="panel" style={{ borderColor: '#fed7aa', background: 'var(--attention-bg)' }} aria-live="polite">
              <h2>Is this the same person?</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                A customer with a similar name already exists. Use them instead to keep one history.
              </p>
              {similar.slice(0, 3).map((c) => (
                <div className="found" key={c.id} style={{ background: '#fff' }}>
                  <span className="avatar">{initials(c.name)}</span>
                  <span className="found__text">
                    <strong>{c.name}</strong>
                    <span>
                      {c.phone}
                      {c.address?.city ? ` · ${c.address.city}` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void pickExisting(c)}>
                    Use
                  </button>
                </div>
              ))}
              {isValidLocalPhone(f.phone) && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Using them adds {formatPhone(f.phone)} as their other phone.
                </p>
              )}
            </section>
          )}

          <section className="panel" aria-label="Preview">
            <h2 className="section-title">Preview</h2>
            <div className="found">
              <span className="avatar">{initials(f.name || '?')}</span>
              <span className="found__text">
                <strong>{f.type === 'business' && f.companyName.trim() ? f.companyName : f.name || 'Customer name'}</strong>
                <span>
                  {[f.phone.trim() && formatPhone(f.phone), f.city.trim()].filter(Boolean).join(' · ') || 'Phone'}
                </span>
                <span>Updates by {CONTACT.find((c) => c.value === f.preferredContact)?.label}</span>
              </span>
            </div>
          </section>

          {!id && (
            <section className="panel">
              <h2>Booking in a device now?</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                “Save and book in a device” opens a new ticket with this customer already filled in.
              </p>
            </section>
          )}
        </aside>
      </div>
    </form>
  );
}
