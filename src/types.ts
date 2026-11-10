import type { Timestamp } from 'firebase/firestore';
import type { Cents } from './lib/money';
import type { RestartRule } from './lib/numberFormat';

export type Role = 'owner' | 'manager' | 'technician' | 'frontdesk';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  technician: 'Technician',
  frontdesk: 'Front desk',
};

/** /users/{uid} */
export interface StaffProfile {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** Set when the owner creates the account with a temporary password. */
  mustChangePassword?: boolean;
}

/** /settings/shop */
export interface ShopSettings {
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: { street?: string; city?: string };
  hours?: { weekdays?: string; saturday?: string; sunday?: string };
  tin?: string;
  logo?: string; // small base64 data URL on Spark
  brandColor?: string; // hex
  currency: 'LKR';
  vatRegistered: boolean;
  /** Percent, typed by the owner (rates change; confirm with the IRD). */
  taxRates?: { vat: number; sscl: number };
  prefixes: { ticket: string; quote: string; invoice: string };
  /** 'yearly' → T-2026-0001 from /counters/2026; 'never' → T-0001 from /counters/all. */
  numberRestart?: RestartRule;
  terms?: string;
  plan: 'spark' | 'blaze';
  setupComplete: boolean;
}

/** /settings/public — readable without signing in (sign-in page, status page). */
export interface PublicShop {
  name: string;
  phone?: string;
  whatsapp?: string;
  hours?: ShopSettings['hours'];
  logo?: string;
  brandColor?: string;
}

/** /counters/{year} */
export interface YearCounters {
  ticket?: number;
  quote?: number;
  invoice?: number;
}

export type PreferredContact = 'whatsapp' | 'call' | 'sms' | 'email';

/** /customers/{id} */
export interface Customer {
  type: 'individual' | 'business';
  name: string;
  companyName?: string;
  phone: string;
  phoneKey: string;
  secondPhone?: string;
  secondPhoneKey?: string;
  email?: string;
  address?: { street?: string; city?: string };
  tin?: string;
  preferredContact: PreferredContact;
  whatsappConsent: boolean;
  notes?: string;
  /** Lower-case word prefixes of name and company, for search (lib/search.ts). */
  searchTokens: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const DEVICE_TYPES = ['Laptop', 'Desktop', 'Printer', 'Monitor', 'Tablet', 'Phone', 'Other'] as const;

/** /devices/{id} */
export interface Device {
  customerId: string;
  type: string;
  brand: string;
  model: string;
  serial?: string;
  /** Upper-case serial without spaces, for lookup. */
  serialKey?: string;
  notes?: string;
  createdAt: Timestamp;
}

/** /devices/{id}/secret/pin */
export interface DeviceSecret {
  pin: string;
  ticketId: string;
}

export const DEFAULT_STATUSES = [
  'received',
  'diagnosing',
  'awaiting_approval',
  'awaiting_parts',
  'in_repair',
  'ready',
  'collected',
  'cancelled',
] as const;
export type TicketStatus = (typeof DEFAULT_STATUSES)[number];

export const OPEN_STATUSES: TicketStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_repair', 'ready'];
export const CLOSED_STATUSES: TicketStatus[] = ['collected', 'cancelled'];

/** /tickets/{id} */
export interface Ticket {
  ticketNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deviceId: string;
  deviceLabel: string;
  deviceType: string;
  deviceSerial?: string;
  problem: string;
  accessories: string[];
  condition: string[];
  conditionNotes?: string;
  diagnosis?: string;
  status: TicketStatus;
  assignedTo?: string | null;
  assignedName?: string | null;
  estimate?: Cents | null;
  advance?: Cents | null;
  dueDate?: Timestamp | null;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  /** Device password given at intake (stored in /devices/{id}/secret/pin). */
  hasPin?: boolean;
  publicToken: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** /tickets/{id}/history/{id} */
export interface HistoryEntry {
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  note?: string;
  byUid: string;
  byName: string;
  at: Timestamp;
}

/** /tickets/{id}/notes/{id} — internal, append-only. */
export interface TicketNote {
  text: string;
  byUid: string;
  byName: string;
  at: Timestamp;
}

/** /publicStatus/{token} — what the customer's QR code shows. No personal details. */
export interface PublicStatus {
  ticketNo: string;
  status: TicketStatus;
  deviceLabel: string;
  dueDate?: Timestamp | null;
  updatedAt: Timestamp;
}

export interface InvoiceItem {
  description: string;
  kind: 'part' | 'labour' | 'other';
  inventoryId?: string;
  qty: number;
  unitPrice: Cents;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'bank' | 'lankaqr';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank transfer',
  lankaqr: 'LANKAQR',
};

/** /invoices/{id} — customer details are copied in, so old invoices never change. */
export interface Invoice {
  invoiceNo: string;
  type: 'repair' | 'sale';
  ticketId?: string | null;
  ticketNo?: string | null;
  deviceLabel?: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerTin?: string;
  items: InvoiceItem[];
  subtotal: Cents;
  discount: Cents;
  sscl: Cents;
  vat: Cents;
  /** sscl + vat */
  tax: Cents;
  /** Tax settings when issued (printed as a "Tax Invoice" when vatRegistered). */
  vatRegistered: boolean;
  taxRates?: { vat: number; sscl: number } | null;
  total: Cents;
  paid: Cents;
  balance: Cents;
  status: InvoiceStatus;
  lastPaymentId?: string;
  voidReason?: string;
  voidedAt?: Timestamp;
  voidedBy?: string;
  issuedBy: string;
  issuedByName: string;
  issuedAt: Timestamp;
  updatedAt: Timestamp;
}

/** /invoices/{id}/payments/{id} — create-only. */
export interface Payment {
  amount: Cents;
  method: PaymentMethod;
  reference?: string;
  /** "advance" for money taken at intake. */
  note?: string;
  byUid: string;
  byName: string;
  at: Timestamp;
}
