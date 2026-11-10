import { collection, doc, getDoc, orderBy, query } from 'firebase/firestore';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert, Field, initials } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { dateTime, fromDateInput, shortDate, toDateInput } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { formatLKR, parseToCents } from '../../lib/money';
import { whatsappLink } from '../../lib/phone';
import { useDoc, useQuery } from '../../lib/useFirestore';
import { useStaff } from '../../lib/useStaff';
import type { Customer, HistoryEntry, Ticket, TicketNote, TicketStatus } from '../../types';
import { addNote, changeStatus, clearPin, deviceTicketsQuery, saveDiagnosis, statusUrl, updateTicket, type Me, type TicketRow } from './data';
import { IntakeReceipt } from './IntakeReceipt';
import { allowedTargets, isClosed, nextStep, STATUS, whatsappMessage } from './status';
import { isOverdue } from './TicketsPage';

/** /tickets/:id */
export function TicketDetailPage() {
  const { id = '' } = useParams();
  const ticket = useDoc<Ticket>(doc(db, 'tickets', id), `tickets/${id}`);
  if (ticket.loading) return <p className="muted">Loading…</p>;
  if (!ticket.data) return <div className="panel empty">This ticket does not exist.</div>;
  return <TicketDetail t={ticket.data} />;
}

function TicketDetail({ t }: { t: TicketRow }) {
  const { profile, user, shop } = useSession();
  const [params, setParams] = useSearchParams();
  const customer = useDoc<Customer>(doc(db, 'customers', t.customerId), `customers/${t.customerId}`);
  const history = useQuery<HistoryEntry>(query(collection(db, 'tickets', t.id, 'history'), orderBy('at', 'desc')), `history-${t.id}`);
  const notes = useQuery<TicketNote>(query(collection(db, 'tickets', t.id, 'notes'), orderBy('at', 'desc')), `notes-${t.id}`);
  const deviceJobs = useQuery<Ticket>(deviceTicketsQuery(t.deviceId), `device-jobs-${t.deviceId}`);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = profile?.role ?? 'technician';
  const desk = role !== 'technician';
  const mine = t.assignedTo === user?.uid;
  const canWork = desk || mine;
  const me: Me = { uid: user?.uid ?? '', name: profile?.name ?? '' };
  const next = canWork ? nextStep(t.status, role) : null;
  const c = customer.data;
  const url = statusUrl(t.publicToken);
  const earlier = deviceJobs.data.filter((x) => x.id !== t.id);

  // Print straight after "Create ticket and print receipt".
  useEffect(() => {
    if (params.get('print') !== '1') return;
    const timer = setTimeout(() => {
      window.print();
      setParams({}, { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [params, setParams]);

  function move(to: TicketStatus, note = '') {
    setError(null);
    changeStatus(t, to, note, me).catch(() => setError('Could not change the status. You may not have permission, or the connection dropped.'));
  }

  const waText = whatsappMessage(t.status, { shop: shop?.name ?? 'the repair shop', ticketNo: t.ticketNo, device: t.deviceLabel, name: t.customerName, statusUrl: url });

  return (
    <>
      <div className="no-print">
        <p className="crumbs">
          <Link to="/tickets">Service tickets</Link> / {t.ticketNo}
        </p>
        <div className="detail-head">
          <div className="detail-head__title">
            <h1>{t.ticketNo}</h1>
            <StatusPill status={t.status} large />
            <span className="muted">
              Booked in {shortDate(t.createdAt)}
              {t.dueDate && (
                <>
                  {' · '}
                  <span className={isOverdue(t) ? 'danger-text' : undefined}>
                    due {shortDate(t.dueDate)}
                    {isOverdue(t) ? ' (overdue)' : ''}
                  </span>
                </>
              )}
            </span>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print receipt
            </button>
            {c?.whatsappConsent !== false && (
              <a className="btn" href={whatsappLink(t.customerPhone, waText)} target="_blank" rel="noreferrer">
                Notify on WhatsApp
              </a>
            )}
            {canWork && allowedTargets(t.status, role).length > 0 && (
              <button className="btn" onClick={() => setStatusOpen(true)}>
                Change status
              </button>
            )}
            {next && (
              <button className="btn btn--primary" onClick={() => move(next.to)}>
                {next.label}
              </button>
            )}
          </div>
        </div>
        <ErrorAlert error={error} />

        <div className="detail">
          <div className="detail__main">
            <div className="cards-3">
              <section className="panel">
                <span className="section-title">Customer</span>
                <div className="kv">
                  <Link to={`/customers/${t.customerId}`} style={{ fontWeight: 800, fontSize: 16 }}>
                    {t.customerName}
                  </Link>
                  <span>{[t.customerPhone, c?.email].filter(Boolean).join(' · ')}</span>
                  {c?.tin && <span>TIN {c.tin}</span>}
                </div>
              </section>
              <section className="panel">
                <span className="section-title">Device</span>
                <div className="kv">
                  <strong>{t.deviceLabel}</strong>
                  <span>
                    {t.deviceType}
                    {t.deviceSerial ? ` · S/N ${t.deviceSerial}` : ''}
                  </span>
                  {earlier.length > 0 && (
                    <span>
                      Seen before: {earlier.length} {earlier.length === 1 ? 'job' : 'jobs'}, last {shortDate(earlier[0].createdAt)}
                    </span>
                  )}
                </div>
              </section>
            </div>

            <section className="panel">
              <h2>Problem and intake</h2>
              <p className="prose">{t.problem}</p>
              {t.accessories.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="section-title">Accessories received</span>
                  <div className="tags">
                    {t.accessories.map((a) => (
                      <span className="tag" key={a}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(t.condition.length > 0 || t.conditionNotes) && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="section-title">Condition at intake</span>
                  <p className="prose">{[...t.condition, t.conditionNotes].filter(Boolean).join(' · ')}</p>
                </div>
              )}
            </section>

            <Diagnosis t={t} canEdit={canWork && !isClosed(t.status)} />

            <section className="panel">
              <h2>Internal notes</h2>
              <AddNote ticketId={t.id} me={me} />
              {notes.data.map((n) => (
                <div className="note" key={n.id}>
                  <span className="note__meta">
                    {n.byName} · {dateTime(n.at)}
                  </span>
                  <p className="prose">{n.text}</p>
                </div>
              ))}
              {notes.data.length === 0 && <p className="muted">No notes yet. Notes are for staff only and can’t be edited later.</p>}
            </section>

            <section className="panel">
              <h2>Parts and labour</h2>
              <p className="muted">Quotes arrive in Phase 4 and invoices in Phase 3. Until then, the estimate is shown on the receipt.</p>
            </section>
          </div>

          <aside className="detail__side">
            <section className="panel">
              <div className="panel__head">
                <h2>Job</h2>
                {desk && (
                  <button className="link-button" onClick={() => setEditOpen(true)}>
                    Change
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="avatar">{initials(t.assignedName ?? '?')}</span>
                <span className="kv">
                  <strong>{t.assignedName ?? 'Unassigned'}</strong>
                  <span>Technician</span>
                </span>
              </div>
              <div className="kv">
                <span>Estimate</span>
                <strong className="num">{t.estimate ? formatLKR(t.estimate) : '—'}</strong>
              </div>
              {t.advance ? (
                <div className="kv">
                  <span>Advance paid</span>
                  <strong className="num">{formatLKR(t.advance)}</strong>
                </div>
              ) : null}
              <div className="kv">
                <span>Due</span>
                <strong>{t.dueDate ? shortDate(t.dueDate) : '—'}</strong>
              </div>
              <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                Customer status page ↗
              </a>
            </section>

            <PinPanel t={t} desk={desk} />

            <section className="panel">
              <h2>Status history</h2>
              <ol className="timeline">
                {history.data.map((h) => (
                  <li key={h.id}>
                    <span className="timeline__dot" style={{ background: STATUS[h.toStatus]?.dot ?? '#999' }} />
                    <strong>{STATUS[h.toStatus]?.label ?? h.toStatus}</strong>
                    <span>
                      {dateTime(h.at)} · {h.byName.split(' ')[0]}
                      {h.note ? ` · ${h.note}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>

      <div className="print-only">
        <IntakeReceipt
          shop={shop}
          variant="print"
          r={{
            ticketNo: t.ticketNo,
            date: t.createdAt?.toDate() ?? new Date(),
            takenBy: t.createdByName,
            customerName: t.customerName,
            customerPhone: t.customerPhone,
            deviceLabel: t.deviceLabel,
            serial: t.deviceSerial,
            problem: t.problem,
            accessories: t.accessories,
            condition: t.condition,
            conditionNotes: t.conditionNotes,
            estimate: t.estimate,
            advance: t.advance,
            dueDate: t.dueDate?.toDate() ?? null,
            statusUrl: url,
          }}
        />
      </div>

      {statusOpen && <StatusDialog t={t} role={role} onClose={() => setStatusOpen(false)} onMove={move} />}
      {editOpen && <EditJobDialog t={t} onClose={() => setEditOpen(false)} />}
    </>
  );
}

function Diagnosis({ t, canEdit }: { t: TicketRow; canEdit: boolean }) {
  const [text, setText] = useState(t.diagnosis ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== (t.diagnosis ?? '').trim();
  return (
    <section className="panel">
      <h2>Diagnosis</h2>
      {canEdit ? (
        <>
          <textarea className="select" style={{ height: 'auto', minHeight: 80, padding: 12 }} aria-label="Diagnosis" placeholder="What is wrong and what needs doing" value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn--sm" disabled={!dirty} onClick={() => {
              setError(null);
              saveDiagnosis(t.id, text).catch(() => setError('Could not save the diagnosis.'));
              setSaved(true);
            }}>
              Save diagnosis
            </button>
            {saved && !dirty && <span className="muted" style={{ fontSize: 12 }}>Saved</span>}
          </div>
          <ErrorAlert error={error} />
        </>
      ) : (
        <p className="prose">{t.diagnosis || <span className="muted">Not diagnosed yet.</span>}</p>
      )}
    </section>
  );
}

function AddNote({ ticketId, me }: { ticketId: string; me: Me }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    addNote(ticketId, text, me).catch(() => setError('Could not add the note.'));
    setText('');
  }
  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="note" className="sr-only">
          Add a note
        </label>
        <textarea id="note" className="compact" placeholder="Add a note for the team" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      </div>
      <button className="btn" type="submit" disabled={!text.trim()}>
        Add
      </button>
      <ErrorAlert error={error} />
    </form>
  );
}

function PinPanel({ t, desk }: { t: TicketRow; desk: boolean }) {
  const [pin, setPin] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!t.hasPin) {
    return (
      <section className="panel">
        <h2>Device password</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          {isClosed(t.status) ? 'Deleted when the job was closed.' : 'None given at intake.'}
        </p>
      </section>
    );
  }
  async function show() {
    setMsg(null);
    try {
      const snap = await getDoc(doc(db, 'devices', t.deviceId, 'secret', 'pin'));
      setPin(snap.exists() ? (snap.data().pin as string) : '');
      if (!snap.exists()) setMsg('The password has already been deleted.');
    } catch {
      setMsg('Only the owner, managers and the assigned technician can see this.');
    }
  }
  return (
    <section className="panel">
      <h2>Device password</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="num" style={{ fontSize: 18, letterSpacing: '0.1em' }}>{pin ?? '••••••'}</span>
        {pin === null ? (
          <button className="btn btn--sm" onClick={() => void show()}>
            Show
          </button>
        ) : (
          <button className="btn btn--sm" onClick={() => setPin(null)}>
            Hide
          </button>
        )}
        {desk && (
          <button className="link-button" onClick={() => void clearPin(t).catch(() => setMsg('Could not delete it.'))}>
            Delete now
          </button>
        )}
      </div>
      {msg && <span className="field__hint">{msg}</span>}
      <span className="field__hint">Visible to the owner, managers and the assigned technician. Deleted automatically when the device is collected.</span>
    </section>
  );
}

/** Open a native <dialog> as a modal on mount; call onClose when it closes (Esc, Cancel, Save). */
function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => closeRef.current();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, []);
  return ref;
}

function StatusDialog({ t, role, onClose, onMove }: { t: TicketRow; role: Parameters<typeof allowedTargets>[1]; onClose: () => void; onMove: (to: TicketStatus, note: string) => void }) {
  const ref = useModal(onClose);
  const targets = allowedTargets(t.status, role);
  const [to, setTo] = useState<TicketStatus>(targets[0]);
  const [note, setNote] = useState('');
  return (
    <dialog className="dialog" ref={ref}>
      <form method="dialog" onSubmit={() => onMove(to, note)}>
        <h2>Change status</h2>
        <fieldset className="choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <legend className="sr-only">New status</legend>
          {targets.map((s) => (
            <label className="choice" key={s}>
              <input type="radio" name="to" checked={to === s} onChange={() => setTo(s)} />
              <strong>{STATUS[s].label}</strong>
            </label>
          ))}
        </fieldset>
        <Field id="status-note" label="Note" optional hint={to === 'collected' || to === 'cancelled' ? 'The stored device password is deleted.' : 'Shown in the status history.'}>
          <input id="status-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. part arrived" />
        </Field>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

function EditJobDialog({ t, onClose }: { t: TicketRow; onClose: () => void }) {
  const ref = useModal(onClose);
  const { staff } = useStaff();
  const techs = staff.filter((s) => s.active && (s.role === 'technician' || s.role === 'manager'));
  const [techId, setTechId] = useState(t.assignedTo ?? '');
  const [estimate, setEstimate] = useState(t.estimate ? String(t.estimate / 100) : '');
  const [due, setDue] = useState(toDateInput(t.dueDate));
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    const cents = estimate.trim() ? parseToCents(estimate) : null;
    if (estimate.trim() && (cents === null || cents < 0)) {
      e.preventDefault();
      return setError('Enter an amount, like 15000.');
    }
    const tech = techs.find((s) => s.uid === techId);
    void updateTicket(t, { estimate: cents, dueDate: fromDateInput(due), assigned: tech ? { uid: tech.uid, name: tech.name } : null });
  }

  return (
    <dialog className="dialog" ref={ref}>
      <form method="dialog" onSubmit={onSubmit}>
        <h2>Job details</h2>
        <Field id="ej-tech" label="Technician">
          <select id="ej-tech" value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">Unassigned</option>
            {techs.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ej-est" label="Estimate (LKR)" optional error={error}>
          <input id="ej-est" inputMode="decimal" className="num" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </Field>
        <Field id="ej-due" label="Due date">
          <input id="ej-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
