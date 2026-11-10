import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './theme/global.css';
import './theme/screens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable app (PWA): only in real builds, never against the local emulators.
if (import.meta.env.PROD && import.meta.env.VITE_USE_EMULATORS !== 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
