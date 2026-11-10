import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { shortDate } from '../../lib/dates';
import { db } from '../../lib/firebase';
import { phoneKey, whatsappLink } from '../../lib/phone';
import type { PublicStatus, TicketStatus } from '../../types';
import { STATUS } from '../tickets/status';

const STEPS: { label: string; covers: TicketStatus[] }[] = [
  { label: 'Received', covers: ['received'] },
  { label: 'Checking the fault', covers: ['diagnosing', 'awaiting_approval'] },
  { label: 'Repairing', covers: ['awaiting_parts', 'in_repair'] },
  { label: 'Ready for pickup', covers: ['ready'] },
  { label: 'Collected', covers: ['collected'] },
];

const EXPLAIN: Partial<Record<TicketStatus, string>> = {
  received: 'We have your device and will start checking it soon.',
  diagnosing: 'A technician is finding the fault.',
  awaiting_approval: 'We have sent you a quote. Please reply to approve it so we can continue.',
  awaiting_parts: 'Your repair is approved. We are waiting for parts to arrive.',
  in_repair: 'Your device is being repaired.',
  ready: 'Your device is ready. Please bring your receipt when you collect it.',
  collected: 'You have collected your device. Thank you!',
  cancelled: 'This job was cancelled. Contact the shop if you have questions.',
};

/** /status/:token — opened from the QR code on the intake receipt. No sign-in. */
export function PublicStatusPage() {
  const { token = '' } = useParams();
  const { publicShop } = useSession();
  const [job, setJob] = useState<PublicStatus | null | 'missing'>(null);

  useEffect(() => {
    if (!/^[0-9a-f]{32}$/.test(token)) return setJob('missing');
    getDoc(doc(db, 'publicStatus', token)).then(
      (s) => setJob(s.exists() ? (s.data() as PublicStatus) : 'missing'),
      () => setJob('missing'),
    );
  }, [token]);

  const shopName = publicShop?.name || 'Repair status';
  const current = job && job !== 'missing' ? STEPS.findIndex((s) => s.covers.includes(job.status)) : -1;

  return (
    <div className="public">
      <main className="public__card">
        <div className="public__shop">
          {publicShop?.logo && <img src={publicShop.logo} alt="" />}
          {shopName}
        </div>

        {job === null && <div className="panel">Loading…</div>}
        {job === 'missing' && (
          <div className="panel">
            <h1 className="h1" style={{ fontSize: 22 }}>Job not found</h1>
            <p className="muted">Check the link on your receipt, or contact the shop.</p>
          </div>
        )}
        {job && job !== 'missing' && (
          <>
            <section className="panel">
              <span className="muted num">{job.ticketNo}</span>
              <h1 className="h1" style={{ fontSize: 24 }}>{job.deviceLabel}</h1>
              <div>
                <StatusPill status={job.status} large />
              </div>
              <p className="prose">{EXPLAIN[job.status] ?? STATUS[job.status].label}</p>
              {job.dueDate && job.status !== 'collected' && job.status !== 'cancelled' && (
                <p className="muted">Expected ready by {shortDate(job.dueDate)}</p>
              )}
              <p className="muted" style={{ fontSize: 12 }}>Last updated {shortDate(job.updatedAt)}</p>
            </section>

            {job.status !== 'cancelled' && (
              <section className="panel">
                <ol className="steps">
                  {STEPS.map((s, i) => (
                    <li key={s.label} className={i < current ? 'done' : i === current ? 'now' : undefined} aria-current={i === current ? 'step' : undefined}>
                      <span className="bullet">{i < current ? <Icon name="check" size={14} /> : null}</span>
                      {s.label}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {(publicShop?.phone || publicShop?.whatsapp) && (
          <section className="panel">
            {publicShop.phone && (
              <a className="btn btn--primary btn--lg" href={`tel:${phoneKey(publicShop.phone)}`}>
                Call the shop
              </a>
            )}
            {publicShop.whatsapp && (
              <a className="btn btn--lg" href={whatsappLink(publicShop.whatsapp, job && job !== 'missing' ? `Hello, I am asking about job ${job.ticketNo}.` : 'Hello')} target="_blank" rel="noreferrer">
                Message on WhatsApp
              </a>
            )}
            {publicShop.hours?.weekdays && (
              <p className="muted" style={{ fontSize: 13 }}>
                Open Mon–Fri {publicShop.hours.weekdays}
                {publicShop.hours.saturday ? ` · Sat ${publicShop.hours.saturday}` : ''}
                {publicShop.hours.sunday ? ` · Sun ${publicShop.hours.sunday}` : ''}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
