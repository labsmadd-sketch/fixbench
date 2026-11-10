import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { formatPhone, isValidLocalPhone } from '../../lib/phone';
import { ErrorAlert, Field, firstName, saveSettings, StepIntro, useSave, type StepProps } from './shared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShopStep({ shop, go, inSettings }: StepProps) {
  const { profile } = useSession();
  const [f, setF] = useState({
    name: shop?.name ?? '',
    phone: shop?.phone ?? '',
    whatsapp: shop?.whatsapp ?? '',
    email: shop?.email ?? '',
    street: shop?.address?.street ?? '',
    city: shop?.address?.city ?? '',
    weekdays: shop?.hours?.weekdays ?? '9:00 am – 6:00 pm',
    saturday: shop?.hours?.saturday ?? '9:00 am – 1:00 pm',
    sunday: shop?.hours?.sunday ?? 'Closed',
    tin: shop?.tin ?? '',
  });
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useSave();

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const errors = {
    name: f.name.trim() ? null : 'Enter the shop name.',
    phone: !f.phone.trim()
      ? 'Enter the shop phone number.'
      : isValidLocalPhone(f.phone)
        ? null
        : 'Use a 10-digit number, like 011 258 4410.',
    whatsapp: f.whatsapp.trim() && !isValidLocalPhone(f.whatsapp) ? 'Use a 10-digit number, like 077 258 4410.' : null,
    email: f.email.trim() && !EMAIL.test(f.email.trim()) ? 'That email does not look right.' : null,
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const invalid = Object.values(errors).some(Boolean);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    const hours = { weekdays: f.weekdays.trim(), saturday: f.saturday.trim(), sunday: f.sunday.trim() };
    const pub = {
      name: f.name.trim(),
      phone: formatPhone(f.phone),
      whatsapp: f.whatsapp.trim() ? formatPhone(f.whatsapp) : '',
      hours,
    };
    void run(async () => {
      await saveSettings(
        shop,
        {
          ...pub,
          email: f.email.trim(),
          address: { street: f.street.trim(), city: f.city.trim() },
          tin: f.tin.trim(),
        },
        pub,
      );
      go(2);
    });
  }

  const contact = [f.phone.trim() && formatPhone(f.phone), f.whatsapp.trim() && `WA ${formatPhone(f.whatsapp)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <form className="setup__grid" onSubmit={onSubmit} noValidate>
      <div className="setup__main">
        <StepIntro title={inSettings ? 'Shop details' : profile ? `Welcome, ${firstName(profile.name)}. Tell us about your shop` : 'Tell us about your shop'}>
          This goes on receipts, invoices and the customer status page.
        </StepIntro>

        <div className="form-grid">
          <Field id="shop-name" label="Shop name" error={shown('name')} className="span-2">
            <input id="shop-name" value={f.name} onChange={set('name')} autoComplete="organization" aria-invalid={!!shown('name')} />
          </Field>
          <Field id="shop-phone" label="Shop phone" error={shown('phone')}>
            <input id="shop-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} aria-invalid={!!shown('phone')} placeholder="011 258 4410" />
          </Field>
          <Field id="shop-wa" label="WhatsApp number" optional error={shown('whatsapp')}>
            <input id="shop-wa" type="tel" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} aria-invalid={!!shown('whatsapp')} placeholder="077 258 4410" />
          </Field>
          <Field id="shop-email" label="Email" optional error={shown('email')} className="span-2">
            <input id="shop-email" type="email" value={f.email} onChange={set('email')} aria-invalid={!!shown('email')} autoComplete="email" />
          </Field>
          <Field id="shop-street" label="Street address" optional>
            <input id="shop-street" value={f.street} onChange={set('street')} autoComplete="street-address" />
          </Field>
          <Field id="shop-city" label="Town or city" optional>
            <input id="shop-city" value={f.city} onChange={set('city')} autoComplete="address-level2" />
          </Field>
        </div>

        <fieldset className="choices" style={{ display: 'block' }}>
          <legend>Opening hours (shown on the status page)</legend>
          <div className="form-grid form-grid--3">
            <Field id="h-week" label="Mon – Fri">
              <input id="h-week" value={f.weekdays} onChange={set('weekdays')} />
            </Field>
            <Field id="h-sat" label="Saturday">
              <input id="h-sat" value={f.saturday} onChange={set('saturday')} />
            </Field>
            <Field id="h-sun" label="Sunday">
              <input id="h-sun" value={f.sunday} onChange={set('sunday')} />
            </Field>
          </div>
        </fieldset>

        <Field id="shop-tin" label="Shop TIN" optional hint="Needed if you register for VAT. Printed on tax invoices.">
          <input id="shop-tin" value={f.tin} onChange={set('tin')} inputMode="numeric" />
        </Field>

        <ErrorAlert error={touched && invalid ? 'Fix the highlighted fields to continue.' : error} />

        <div className="setup__actions">
          <span className="spacer" />
          <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
            {busy ? 'Saving…' : inSettings ? 'Save changes' : 'Continue to logo and colours'} {!inSettings && <Icon name="arrowRight" />}
          </button>
        </div>
      </div>

      <aside className="setup__aside" aria-label="Receipt preview">
        <h2 className="section-title">On your receipts</h2>
        <div className="paper">
          {shop?.logo ? (
            <img className="paper__logo" src={shop.logo} alt="" />
          ) : (
            <span className="paper__logo paper__logo--empty">logo</span>
          )}
          <span className="paper__name">{f.name.trim() || 'Your repair shop'}</span>
          {(f.street.trim() || f.city.trim()) && (
            <span className="paper__center">{[f.street.trim(), f.city.trim()].filter(Boolean).join(', ')}</span>
          )}
          {contact && <span className="paper__center">{contact}</span>}
          {f.tin.trim() && <span className="paper__center">TIN {f.tin.trim()}</span>}
          <div className="paper__rule" />
          <div className="paper__row">
            <span>Ticket</span>
            <span className="mono">T-{new Date().getFullYear()}-0001</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          {shop?.logo ? 'You can change the logo in the next step.' : 'Your logo is added in the next step.'}
        </p>
      </aside>
    </form>
  );
}
