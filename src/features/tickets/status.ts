import type { Role, TicketStatus } from '../../types';

/** Fixed status colours (not themed by the brand colour), from the design canvas. */
export const STATUS: Record<TicketStatus, { label: string; bg: string; fg: string; dot: string }> = {
  received: { label: 'Received', bg: '#EEF0F3', fg: '#374151', dot: '#6B7280' },
  diagnosing: { label: 'Diagnosing', bg: '#E0F2FE', fg: '#075985', dot: '#0284C7' },
  awaiting_approval: { label: 'Awaiting approval', bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  awaiting_parts: { label: 'Awaiting parts', bg: '#FFEDD5', fg: '#9A3412', dot: '#EA580C' },
  in_repair: { label: 'In repair', bg: '#EDE9FE', fg: '#5B21B6', dot: '#7C3AED' },
  ready: { label: 'Ready for pickup', bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  collected: { label: 'Collected', bg: '#F1F5F9', fg: '#334155', dot: '#64748B' },
  cancelled: { label: 'Cancelled', bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
};

const FLOW: TicketStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_repair', 'ready', 'collected'];

/** Statuses only the counter can set: handing the device back or cancelling. */
export const COUNTER_ONLY: TicketStatus[] = ['collected', 'cancelled'];

export const isClosed = (s: TicketStatus) => s === 'collected' || s === 'cancelled';

/** The usual next step, for the one-click button ("Start diagnosis", "Mark ready"…). */
export function nextStep(current: TicketStatus, role: Role): { to: TicketStatus; label: string } | null {
  const labels: Partial<Record<TicketStatus, string>> = {
    diagnosing: 'Start diagnosis',
    awaiting_approval: 'Send quote',
    awaiting_parts: 'Approved, order parts',
    in_repair: 'Start repair',
    ready: 'Mark ready',
    collected: 'Hand over',
  };
  const i = FLOW.indexOf(current);
  if (i < 0 || i >= FLOW.length - 1) return null;
  const to = FLOW[i + 1];
  if (role === 'technician' && COUNTER_ONLY.includes(to)) return null;
  return { to, label: labels[to] ?? STATUS[to].label };
}

/** Every status this role may move the ticket to (any order: real repairs skip steps). */
export function allowedTargets(current: TicketStatus, role: Role): TicketStatus[] {
  if (isClosed(current)) {
    // Re-open a closed job (e.g. came back under warranty): counter only.
    return role === 'technician' ? [] : ['received'];
  }
  return (Object.keys(STATUS) as TicketStatus[]).filter(
    (s) => s !== current && !(role === 'technician' && COUNTER_ONLY.includes(s)),
  );
}

/** Message for "Notify on WhatsApp", per status. */
export function whatsappMessage(status: TicketStatus, o: { shop: string; ticketNo: string; device: string; name: string; statusUrl?: string }): string {
  const hi = `Hello ${o.name.split(' ')[0]}, this is ${o.shop}.`;
  const link = o.statusUrl ? `\nCheck the status any time: ${o.statusUrl}` : '';
  switch (status) {
    case 'ready':
      return `${hi} Your ${o.device} (job ${o.ticketNo}) is ready for pickup. Please bring your receipt.${link}`;
    case 'awaiting_approval':
      return `${hi} We have checked your ${o.device} (job ${o.ticketNo}) and have a quote for you. Please reply to approve or call us.${link}`;
    case 'awaiting_parts':
      return `${hi} We are waiting for parts for your ${o.device} (job ${o.ticketNo}). We will message you when it is repaired.${link}`;
    default:
      return `${hi} Update on your ${o.device} (job ${o.ticketNo}): ${STATUS[status].label}.${link}`;
  }
}
