import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Nur für System-Benachrichtigungen; der Service Worker cached nichts.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
