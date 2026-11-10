import { STATUS } from '../features/tickets/status';
import type { TicketStatus } from '../types';

export function StatusPill({ status, large }: { status: TicketStatus; large?: boolean }) {
  const s = STATUS[status] ?? STATUS.received;
  return (
    <span className={`status${large ? ' status--lg' : ''}`} style={{ background: s.bg, color: s.fg }}>
      <span className="status__dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}
