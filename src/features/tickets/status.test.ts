import { describe, expect, it } from 'vitest';
import { contrast } from '../../theme/brand';
import { allowedTargets, nextStep, STATUS, whatsappMessage } from './status';

describe('ticket statuses', () => {
  it('keep pill text readable (4.5:1)', () => {
    for (const s of Object.values(STATUS)) expect(contrast(s.fg, s.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('suggest the next step in the usual flow', () => {
    expect(nextStep('received', 'technician')).toEqual({ to: 'diagnosing', label: 'Start diagnosis' });
    expect(nextStep('in_repair', 'technician')?.to).toBe('ready');
    expect(nextStep('ready', 'frontdesk')).toEqual({ to: 'collected', label: 'Hand over' });
    expect(nextStep('ready', 'technician')).toBeNull();
    expect(nextStep('collected', 'owner')).toBeNull();
  });

  it('keep collection and cancelling at the counter', () => {
    expect(allowedTargets('in_repair', 'technician')).not.toContain('collected');
    expect(allowedTargets('in_repair', 'technician')).not.toContain('cancelled');
    expect(allowedTargets('in_repair', 'frontdesk')).toContain('cancelled');
    expect(allowedTargets('collected', 'technician')).toEqual([]);
    expect(allowedTargets('collected', 'manager')).toEqual(['received']);
  });

  it('write a ready message with the status link', () => {
    const m = whatsappMessage('ready', { shop: 'Demo Repair', ticketNo: 'T-2026-0001', device: 'Dell Inspiron', name: 'Kasun Fernando', statusUrl: 'https://x/status/abc' });
    expect(m).toContain('Hello Kasun');
    expect(m).toContain('ready for pickup');
    expect(m).toContain('https://x/status/abc');
  });
});
