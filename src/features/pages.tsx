import { ComingSoon } from '../components/ComingSoon';

// Placeholders for modules not built yet, in roadmap order. Each moves to its own
// folder (features/<module>/) when its phase starts.

export const QuotesPage = () => (
  <ComingSoon title="Quotes" phase="Phase 4 · week 5" points={['Recommended and optional items', 'WhatsApp approval message', 'Convert to invoice']} />
);

export const InvoicesPage = () => (
  <ComingSoon title="Invoices and sales" phase="Phase 3 · week 4" points={['Numbered invoices, partial payments, void (owner)', 'Counter sales', 'A4 and 80mm printing']} />
);

export const InventoryPage = () => (
  <ComingSoon title="Inventory" phase="Phase 4 · week 5" points={['Stock deducted in the invoice transaction', 'Low-stock alerts', 'Stock movements']} />
);

export const ReportsPage = () => (
  <ComingSoon title="Reports" phase="Phase 5 · week 6" points={['Revenue by day with aggregation queries', 'Jobs per technician', 'CSV export']} />
);

export const SettingsPage = () => (
  <ComingSoon title="Settings" phase="Phase 5 · week 6" points={['Logo and brand colour with live preview (theme/brand.ts)', 'Tax, numbering, statuses, staff', 'Export all data']} />
);

export const NotFoundPage = () => (
  <ComingSoon title="Page not found" phase="404" points={['Use the menu on the left to find your way back.']} />
);
