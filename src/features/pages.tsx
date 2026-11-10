import { ComingSoon } from '../components/ComingSoon';

// Placeholders for modules not built yet, in roadmap order. Each moves to its own
// folder (features/<module>/) when its phase starts.

export const ReportsPage = () => (
  <ComingSoon title="Reports" phase="Phase 5 · week 6" points={['Revenue by day with aggregation queries', 'Jobs per technician', 'CSV export']} />
);

export const SettingsPage = () => (
  <ComingSoon title="Settings" phase="Phase 5 · week 6" points={['Logo and brand colour with live preview (theme/brand.ts)', 'Tax, numbering, statuses, staff', 'Export all data']} />
);

export const NotFoundPage = () => (
  <ComingSoon title="Page not found" phase="404" points={['Use the menu on the left to find your way back.']} />
);
