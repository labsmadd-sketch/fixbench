import type { InvoiceStatus } from '../../types';
import { INVOICE_STATUS } from './data';

export function InvoicePill({ status, large }: { status: InvoiceStatus; large?: boolean }) {
  const s = INVOICE_STATUS[status];
  return (
    <span className={`status${large ? ' status--lg' : ''}`} style={{ background: s.bg, color: s.fg }}>
      <span className="status__dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}
