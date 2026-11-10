/**
 * Sri Lankan phone numbers are typed many ways: "076 552 1098", "0765521098",
 * "+94 76 552 1098", "94765521098". `phoneKey` reduces them to one local
 * form ("0765521098") so lookups at the counter always match.
 */
export function phoneKey(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0094')) digits = digits.slice(4);
  else if (digits.startsWith('94') && digits.length === 11) digits = digits.slice(2);
  if (digits.length === 9) digits = '0' + digits;
  return digits;
}

/** True for a 10-digit local number (mobile or landline). */
export function isValidLocalPhone(input: string): boolean {
  return /^0\d{9}$/.test(phoneKey(input));
}

/** "0765521098" → "076 552 1098" for display. */
export function formatPhone(input: string): string {
  const k = phoneKey(input);
  return /^0\d{9}$/.test(k) ? `${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6)}` : input.trim();
}

/** wa.me link for the "Notify on WhatsApp" buttons. */
export function whatsappLink(input: string, message: string): string {
  const k = phoneKey(input);
  const international = k.startsWith('0') ? '94' + k.slice(1) : k;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
