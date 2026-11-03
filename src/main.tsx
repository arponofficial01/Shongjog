import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Immediate Theme / Mode Initialization to prevent unstyled flash
try {
  const savedMode = localStorage.getItem('shongjog_mode') || 'dark';
  document.documentElement.setAttribute('data-mode', savedMode);
} catch (e) {
  document.documentElement.setAttribute('data-mode', 'dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Offline Service Worker with automatic update detection
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.update().catch(() => {});
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn('Service worker registration notice:', err);
      });
  });
}

