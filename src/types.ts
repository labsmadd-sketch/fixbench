import type { Timestamp } from 'firebase/firestore';
import type { Cents } from './lib/money';

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
  prefixes: { ticket: string; quote: string; invoice: string };
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
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

/** /tickets/{id} */
export interface Ticket {
  ticketNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deviceId: string;
  deviceLabel: string;
  problem: string;
  accessories: string[];
  condition: string[];
  conditionNotes?: string;
  diagnosis?: string;
  status: TicketStatus;
  assignedTo?: string;
  estimate?: Cents;
  advance?: Cents;
  dueDate?: Timestamp;
  publicToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvoiceItem {
  description: string;
  kind: 'part' | 'labour' | 'other';
  inventoryId?: string;
  qty: number;
  unitPrice: Cents;
}

/** /invoices/{id} */
export interface Invoice {
  invoiceNo: string;
  type: 'repair' | 'sale';
  ticketId?: string;
  customerId: string;
  customerName: string;
  customerTin?: string;
  items: InvoiceItem[];
  subtotal: Cents;
  discount: Cents;
  tax: Cents;
  total: Cents;
  paid: Cents;
  balance: Cents;
  status: 'unpaid' | 'partial' | 'paid' | 'void';
  voidReason?: string;
  issuedAt: Timestamp;
  updatedAt: Timestamp;
}
