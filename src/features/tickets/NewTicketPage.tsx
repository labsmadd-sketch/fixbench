import { doc } from 'firebase/firestore';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, Field, initials } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { fromDateInput, inDays, shortDate } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { parseToCents } from '../../lib/money';
import { whatsappLink } from '../../lib/phone';
import { parseCustomerQuery } from '../../lib/search';
import { useDebounced } from '../../lib/useDebounced';
import { useDoc, useQuery } from '../../lib/useFirestore';
import { useOnline } from '../../lib/useOnline';
import { useStaff } from '../../lib/useStaff';
import type { Customer, Device, Ticket } from '../../types';
import {
  customerDevicesQuery,
  customerTicketsQuery,
  deviceLabel,
  searchCustomers,
  type CustomerRow,
  type DeviceInput,
} from '../customers/data';
import { DeviceFields, deviceErrors, EMPTY_DEVICE } from '../customers/DeviceFields';
import { createTicket, openTicketsQuery, statusUrl } from './data';
import { IntakeReceipt } from './IntakeReceipt';
import { whatsappMessage } from './status';

const QUICK_PROBLEMS = ['No power', 'Slow / virus', 'Broken screen', 'OS install', 'Data recovery', 'Keyboard fault', 'Battery not charging'];
const ACCESSORIES = ['Charger', 'Bag', 'Battery', 'Mouse', 'Power cable', 'Box'];
const CONDITIONS = ['Scratches', 'Dents', 'Cracked screen', 'Missing keys', 'Liquid damage'];

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** /tickets/new (optionally ?customer=…&device=…) */
export function NewTicketPage() {
  const [params, setParams] = useSearchParams();
  const customerId = params.get('customer');
  const customerDoc = useDoc<Customer>(customerId ? doc(db, 'customers', customerId) : null, customerId ?? '');

  if (customerId && customerDoc.loading) return <p className="muted">Loading…</p>;

  return (
    <NewTicketForm
      key={customerId ?? 'none'}
      customer={customerDoc.data}
      initialDevice={params.get('device')}
      pickCustomer={(id) => setParams(id ? { customer: id } : {})}
    />
  );
}

function NewTicketForm({
  customer,
  initialDevice,
  pickCustomer,
}: {
  customer: CustomerRow | null;
  initialDevice: string | null;
  pickCustomer: (id: string | null) => void;
}) {
  const { profile, user, shop } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const { staff } = useStaff();
  const open = useQuery<Ticket>(openTicketsQuery(), 'open-tickets');
  const devices = useQuery<Device>(customer ? customerDevicesQuery(customer.id) : null, `devices-of-${customer?.id}`);
  const history = useQuery<Ticket>(customer ? customerTicketsQuery(customer.id) : null, `tickets-of-${customer?.id}`);

  // Customer lookup
  const [lookup, setLookup] = useState('');
  const q = useDebounced(lookup, 250);
  const [results, setResults] = useState<CustomerRow[] | null>(null);
  useEffect(() => {
    if (parseCustomerQuery(q).kind === 'none') return setResults(null);
    let live = true;
    searchCustomers(q).then((r) => live && setResults(r), () => live && setResults([]));
    return () => {
      live = false;
    };
  }, [q]);

  // Device: existing id, or 'new'
  const [deviceId, setDeviceId] = useState<string | 'new' | null>(initialDevice);
  const [newDevice, setNewDevice] = useState<DeviceInput>(EMPTY_DEVICE);
  useEffect(() => {
    // No devices yet → straight to "new device".
    if (customer && !devices.loading && devices.data.length === 0 && deviceId === null) setDeviceId('new');
  }, [customer, devices.loading, devices.data.length, deviceId]);

  // Problem and intake
  const [problem, setProblem] = useState('');
  const [accessories, setAccessories] = useState<string[]>(['Charger']);
  const [extraAccessory, setExtraAccessory] = useState('');
  const [condition, setCondition] = useState<string[]>([]);
  const [conditionNotes, setConditionNotes] = useState('');
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [due, setDue] = useState(inDays(3));
  const [techId, setTechId] = useState('');
  const [pin, setPin] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const techs = staff.filter((s) => s.active && (s.role === 'technician' || s.role === 'manager'));
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of open.data) if (t.assignedTo) m.set(t.assignedTo, (m.get(t.assignedTo) ?? 0) + 1);
    return m;
  }, [open.data]);

  const chosenDevice = deviceId && deviceId !== 'new' ? devices.data.find((d) => d.id === deviceId) : undefined;
  const lastVisit = (id: string) => history.data.find((t) => t.deviceId === id);

  const estimateCents = estimate.trim() ? parseToCents(estimate) : null;
  const advanceCents = advance.trim() ? parseToCents(advance) : null;
  const errors = {
    customer: customer ? null : 'Find or add the customer first.',
    device: !deviceId ? 'Choose the device or add a new one.' : deviceId === 'new' ? deviceErrors(newDevice).brand : null,
    problem: problem.trim() ? null : 'Describe the problem in the customer’s words.',
    estimate: estimate.trim() && (estimateCents === null || estimateCents < 0) ? 'Enter an amount, like 15000.' : null,
    advance: advance.trim() && (advanceCents === null || advanceCents < 0) ? 'Enter an amount, like 5000.' : null,
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const invalid = Object.values(errors).some(Boolean);

  const label = chosenDevice ? deviceLabel(chosenDevice) : deviceId === 'new' ? deviceLabel(newDevice) : '';

  async function create(sendWhatsApp: boolean) {
    setTouched(true);
    if (invalid || !customer || !profile || !user || !shop) return;
    if (!online) return setError('You are offline. Creating a ticket needs a connection to issue the number.');
    // Open the WhatsApp tab now, inside the click, so pop-up blockers allow it.
    const wa = sendWhatsApp && customer.whatsappConsent ? window.open('', '_blank') : null;
    setBusy(true);
    setError(null);
    try {
      const tech = techs.find((s) => s.uid === techId);
      const res = await createTicket(
        {
          customer,
          device: deviceId === 'new' ? { new: newDevice } : { id: chosenDevice!.id, type: chosenDevice!.type, brand: chosenDevice!.brand, model: chosenDevice!.model, serial: chosenDevice!.serial },
          problem,
          accessories,
          condition,
          conditionNotes,
          estimate: estimateCents,
          advance: advanceCents,
          dueDate: fromDateInput(due),
          assigned: tech ? { uid: tech.uid, name: tech.name } : null,
          pin,
        },
        shop,
        { uid: user.uid, name: profile.name },
      );
      if (wa) {
        wa.location.href = whatsappLink(
          customer.phone,
          whatsappMessage('received', { shop: shop.name, ticketNo: res.ticketNo, device: label, name: customer.name, statusUrl: statusUrl(res.token) }),
        );
      }
      navigate(`/tickets/${res.id}${sendWhatsApp ? '' : '?print=1'}`, { replace: true });
    } catch (e) {
      wa?.close();
      console.error(e);
      setError('Could not create the ticket. Check your connection and try again; no number was used.');
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void create(false);
  }

  const digits = lookup.replace(/\D/g, '');

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="crumbs">
        <Link to="/tickets">Service tickets</Link> / New
      </p>
      <div className="page-head">
        <h1 className="h1">New service ticket</h1>
      </div>

      <div className="intake">
        <div className="detail__main">
          {/* 1 · Customer */}
          <section className="panel">
            <h2>1 · Customer</h2>
            {customer ? (
              <div className="found">
                <span className="avatar">{initials(customer.name)}</span>
                <span className="found__text">
                  <strong>{customer.name}</strong>
                  <span>
                    {customer.phone}
                    {history.data.length > 0
                      ? ` · returning customer · ${history.data.length} previous ${history.data.length === 1 ? 'job' : 'jobs'}`
                      : ' · first job'}
                  </span>
                </span>
                <button type="button" className="btn btn--sm" onClick={() => pickCustomer(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <Field id="lookup" label="Phone number or name" error={shown('customer')}>
                  <input id="lookup" type="search" inputMode="search" autoFocus value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="077 123 4567" />
                </Field>
                {results && results.length > 0 && (
                  <div className="people">
                    {results.slice(0, 6).map((c) => (
                      <button type="button" key={c.id} className="person" style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 12, padding: '12px 14px', cursor: 'pointer', borderTop: '1px solid var(--line)' }} onClick={() => pickCustomer(c.id)}>
                        <span className="avatar">{initials(c.name)}</span>
                        <span className="person__text">
                          <strong>{c.name}</strong>
                          <span>
                            {c.phone}
                            {c.address?.city ? ` · ${c.address.city}` : ''}
                          </span>
                        </span>
                        <span className="btn btn--sm">Use</span>
                      </button>
                    ))}
                  </div>
                )}
                {results && results.length === 0 && (
                  <div className="alert">
                    No customer found for “{q.trim()}”.{' '}
                    <Link to={`/customers/new?next=ticket${digits.length >= 9 ? `&phone=${digits}` : ''}`}>Add them as a new customer</Link> — you come straight back here.
                  </div>
                )}
                {!results && (
                  <p className="muted" style={{ fontSize: 13 }}>
                    Type the phone number in any format, or part of the name.{' '}
                    <Link to="/customers/new?next=ticket">New customer</Link>
                  </p>
                )}
              </>
            )}
          </section>

          {/* 2 · Device */}
          {customer && (
            <section className="panel">
              <h2>2 · Device</h2>
              {devices.data.length > 0 && (
                <div className="device-pick" role="radiogroup" aria-label="Device">
                  {devices.data.map((d) => {
                    const last = lastVisit(d.id);
                    return (
                      <label className="choice" key={d.id}>
                        <input type="radio" name="device" checked={deviceId === d.id} onChange={() => setDeviceId(d.id)} />
                        <strong>{deviceLabel(d)}</strong>
                        <span>
                          {d.type}
                          {d.serial ? ` · S/N ${d.serial}` : ''}
                          {last ? ` · last in ${shortDate(last.createdAt)}` : ''}
                        </span>
                      </label>
                    );
                  })}
                  <label className="choice">
                    <input type="radio" name="device" checked={deviceId === 'new'} onChange={() => setDeviceId('new')} />
                    <strong>+ Add a new device</strong>
                    <span>Not in the list</span>
                  </label>
                </div>
              )}
              {deviceId === 'new' && <DeviceFields value={newDevice} onChange={setNewDevice} showErrors={touched} idPrefix="nt-dev" />}
              {shown('device') && deviceId !== 'new' && <span className="field__error">{shown('device')}</span>}
            </section>
          )}

          {/* 3 · Problem and intake */}
          <section className="panel">
            <h2>3 · Problem and intake</h2>
            <Field id="problem" label="What’s wrong, in the customer’s words" error={shown('problem')}>
              <textarea id="problem" value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} aria-invalid={!!shown('problem')} />
            </Field>
            <div className="toggles" aria-label="Common problems">
              {QUICK_PROBLEMS.map((p) => (
                <button type="button" key={p} className="toggle toggle--add" onClick={() => setProblem((x) => (x.trim() ? `${x.trim()}. ${p}` : p))}>
                  + {p}
                </button>
              ))}
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <span className="section-title">Accessories received</span>
              <div className="toggles">
                {[...ACCESSORIES, ...accessories.filter((a) => !ACCESSORIES.includes(a))].map((a) => (
                  <button type="button" key={a} className="toggle" aria-pressed={accessories.includes(a)} onClick={() => setAccessories((l) => toggle(l, a))}>
                    {a}
                  </button>
                ))}
                <span className="inline-form" style={{ gap: 6 }}>
                  <input className="select" style={{ width: 140, height: 36 }} placeholder="Other…" aria-label="Other accessory" value={extraAccessory} onChange={(e) => setExtraAccessory(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (extraAccessory.trim()) setAccessories((l) => [...l, extraAccessory.trim()]);
                      setExtraAccessory('');
                    }
                  }} />
                </span>
              </div>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <span className="section-title">Condition at intake</span>
              <div className="toggles">
                {CONDITIONS.map((c) => (
                  <button type="button" key={c} className="toggle" aria-pressed={condition.includes(c)} onClick={() => setCondition((l) => toggle(l, c))}>
                    {c}
                  </button>
                ))}
              </div>
              <Field id="cond-notes" label="Condition notes" optional hint="Photo capture arrives with the Blaze upgrade.">
                <input id="cond-notes" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} placeholder="Scratches on lid, dent near right hinge" />
              </Field>
            </div>

            <div className="form-grid">
              <Field id="estimate" label="Estimate (LKR)" optional error={shown('estimate')}>
                <input id="estimate" inputMode="decimal" className="num" value={estimate} onChange={(e) => setEstimate(e.target.value)} aria-invalid={!!shown('estimate')} />
              </Field>
              <Field id="advance" label="Advance taken (LKR)" optional error={shown('advance')} hint="Recorded as a payment when invoicing arrives (Phase 3).">
                <input id="advance" inputMode="decimal" className="num" value={advance} onChange={(e) => setAdvance(e.target.value)} aria-invalid={!!shown('advance')} />
              </Field>
              <Field id="due" label="Due date">
                <input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field id="tech" label="Technician">
                <select id="tech" value={techId} onChange={(e) => setTechId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {techs.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.name} ({openCount.get(s.uid) ?? 0} open)
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="pin" label="Device password or PIN" optional hint="Stored separately and deleted when the device is collected." className="span-2">
                <input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" spellCheck={false} className="mono" />
              </Field>
            </div>
          </section>
        </div>

        <aside className="intake__aside">
          <IntakeReceipt
            shop={shop}
            variant="preview"
            r={{
              ticketNo: null,
              date: new Date(),
              takenBy: profile?.name ?? '',
              customerName: customer?.name ?? '',
              customerPhone: customer?.phone ?? '',
              deviceLabel: label,
              serial: chosenDevice?.serial ?? (deviceId === 'new' ? newDevice.serial : ''),
              problem,
              accessories,
              condition,
              conditionNotes,
              estimate: estimateCents,
              advance: advanceCents,
              dueDate: fromDateInput(due),
              statusUrl: null,
            }}
          />
          <ErrorAlert error={touched && invalid ? 'Fill in the highlighted parts to create the ticket.' : error} />
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !online}>
            <Icon name="printer" /> {busy ? 'Creating…' : 'Create ticket and print receipt'}
          </button>
          <button type="button" className="btn" disabled={busy || !online || (customer ? !customer.whatsappConsent : false)} onClick={() => void create(true)}>
            Create, send on WhatsApp
          </button>
          {customer && !customer.whatsappConsent && <span className="field__hint">This customer has not agreed to WhatsApp updates.</span>}
          <span className={online ? 'field__hint' : 'field__error'}>
            {online ? 'Needs an internet connection to issue the ticket number.' : 'You are offline. Reconnect to create the ticket.'}
          </span>
        </aside>
      </div>
    </form>
  );
}
