import { describe, expect, it } from 'vitest';
import { formatPhone, isValidLocalPhone, phoneKey, whatsappLink } from './phone';

describe('phoneKey', () => {
  it.each([
    ['076 552 1098', '0765521098'],
    ['0765521098', '0765521098'],
    ['+94 76 552 1098', '0765521098'],
    ['94765521098', '0765521098'],
    ['0094 76 552 1098', '0765521098'],
    ['76 552 1098', '0765521098'],
    ['011-258-4410', '0112584410'],
  ])('%s → %s', (input, expected) => {
    expect(phoneKey(input)).toBe(expected);
  });
});

describe('helpers', () => {
  it('validates local numbers', () => {
    expect(isValidLocalPhone('+94 76 552 1098')).toBe(true);
    expect(isValidLocalPhone('12345')).toBe(false);
  });
  it('formats for display', () => {
    expect(formatPhone('+94765521098')).toBe('076 552 1098');
  });
  it('builds WhatsApp links in international form', () => {
    expect(whatsappLink('076 552 1098', 'Hi')).toBe('https://wa.me/94765521098?text=Hi');
  });
});
