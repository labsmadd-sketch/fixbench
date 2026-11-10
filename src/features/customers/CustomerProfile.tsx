import { doc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, initials } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { shortDate } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { formatAmount } from '../../lib/money';
import { whatsappLink } from '../../lib/phone';
import { useDoc, useQuery } from '../../lib/useFirestore';
import { OPEN_STATUSES, type Customer, type Device, type Ticket } from '../../types';
import { addDevice, customerDevicesQuery, customerTicketsQuery, deviceLabel, type DeviceInput } from './data';
import { DeviceFields, deviceErrors, EMPTY_DEVICE } from './DeviceFields';

const CONTACT_LABEL = { whatsapp: 'WhatsApp', call: 'Phone call', sms: 'SMS', email: 'Email' } as const;

/** /customers/:id */
export function CustomerProfile() {
  const { id = '' } = useParams();
  const { profile, shop } = useSession();
  const navigate = useNavigate();
  const customer = useDoc<Customer>(doc(db, 'customers', id), `customers/${id}`);
  const devices = useQuery<Device>(customerDevicesQuery(id), `devices-of-${id}`);
  const tickets = useQuery<Ticket>(customerTicketsQuery(id), `tickets-of-${id}`);
  const [adding, setAdding] = useState(false);
  const desk = profile?.role !== 'technician';

  if (customer.loading) return <p className="muted">Loading…</p>;
  const c = customer.data;
  if (!c) return <div className="panel empty">This customer no longer exists.</div>;

  const jobs = tickets.data;
  const open = jobs.filter((t) => OPEN_STATUSES.includes(t.status));
  const jobsPerDevice = new Map<string, number>();
  for (const t of jobs) jobsPerDevice.set(t.deviceId, (jobsPerDevice.get(t.deviceId) ?? 0) + 1);
  const hello = `Hello ${c.name.split(' ')[0]}, this is ${shop?.name ?? 'the repair shop'}.`;

  return (
    <div className="stack">
      <section className="panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
            {initials(c.name)}
          </span>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <h2 style={{ fontSize: 22 }}>{c.type === 'business' && c.companyName ? c.companyName : c.name}</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {[c.type === 'business' && c.companyName ? c.name : '', c.phone, c.secondPhone, c.email, c.address?.city]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>Customer since {shortDate(c.createdAt)}</p>
          </div>
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {desk && (
              <Link to={`/customers/${id}/edit`} className="btn">
                Edit
              </Link>
            )}
            <a className="btn" href={whatsappLink(c.phone, hello)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            {desk && (
              <Link to={`/tickets/new?customer=${id}`} className="btn btn--primary">
                <Icon name="plus" /> New ticket for {c.name.split(' ')[0]}
              </Link>
            )}
          </div>
        </div>
        <div className="tags">
          <span className="tag">Updates by {CONTACT_LABEL[c.preferredContact]}</span>
          {c.whatsappConsent ? <span className="tag">WhatsApp OK</span> : <span className="tag">No WhatsApp updates</span>}
          {c.tin && <span className="tag">TIN {c.tin}</span>}
        </div>
        {c.notes && (
          <div className="alert" style={{ whiteSpace: 'pre-wrap' }}>
            <strong>Staff note:</strong> {c.notes}
          </div>
        )}
      </section>

      <div className="stats">
        <div className="stat">
          <span>Jobs</span>
          <strong>{jobs.length}</strong>
        </div>
        <div className="stat">
          <span>Open now</span>
          <strong>{open.length}</strong>
        </div>
        <div className="stat">
          <span>Last visit</span>
          <strong>{jobs[0] ? shortDate(jobs[0].createdAt) : '—'}</strong>
        </div>
        <div className="stat">
          <span>Devices</span>
          <strong>{devices.data.length}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Devices</h2>
          {desk && !adding && (
            <button className="btn btn--sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Add device
            </button>
          )}
        </div>
        {adding && <AddDevice customerId={id} onDone={() => setAdding(false)} />}
        {devices.data.length === 0 && !adding && <p className="muted">No devices yet. They are added when you book one in.</p>}
        {devices.data.map((d) => (
          <div className="found" key={d.id} style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
            <span className="found__text">
              <strong>{deviceLabel(d)}</strong>
              <span>
                {d.type}
                {d.serial ? ` · S/N ${d.serial}` : ''} · {jobsPerDevice.get(d.id) ?? 0} {jobsPerDevice.get(d.id) === 1 ? 'job' : 'jobs'}
              </span>
            </span>
            {desk && (
              <Link className="btn btn--sm" to={`/tickets/new?customer=${id}&device=${d.id}`}>
                Book in
              </Link>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Jobs · {jobs.length}</h2>
        {jobs.length === 0 ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ border: 0 }}>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Device and problem</th>
                  <th>Status</th>
                  <th className="right hide-sm">Estimate</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                    <td>
                      <Link className="row-link" to={`/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        {t.ticketNo}
                      </Link>
                      <span className="sub">{shortDate(t.createdAt)}</span>
                    </td>
                    <td>
                      {t.deviceLabel}
                      <span className="sub">{t.problem}</span>
                    </td>
                    <td>
                      <StatusPill status={t.status} />
                    </td>
                    <td className="right num hide-sm">{t.estimate ? formatAmount(t.estimate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AddDevice({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const [d, setD] = useState<DeviceInput>(EMPTY_DEVICE);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (deviceErrors(d).brand) return;
    try {
      addDevice(customerId, d);
      onDone();
    } catch {
      setError('Could not add the device. Try again.');
    }
  }

  return (
    <form className="card stack" style={{ background: 'var(--ground)' }} onSubmit={onSubmit} noValidate>
      <DeviceFields value={d} onChange={setD} showErrors={touched} idPrefix="add-dev" />
      <ErrorAlert error={error} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary" type="submit">
          Add device
        </button>
        <button className="btn btn--ghost" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
