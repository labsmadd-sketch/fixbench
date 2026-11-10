import { ComingSoon } from '../components/ComingSoon';

// Placeholders for modules not built yet, in roadmap order. Each moves to its own
// folder (features/<module>/) when its phase starts.

export const NotFoundPage = () => (
  <ComingSoon title="Page not found" phase="404" points={['Use the menu on the left to find your way back.']} />
);
