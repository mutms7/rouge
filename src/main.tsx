import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadArtManifest } from './app/art/manifest';
import './app/styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element. Check index.html.');

// One small JSON fetch before the first paint. Cheaper than a flash of placeholders
// over real art, and it keeps the manifest out of the module graph entirely.
await loadArtManifest();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
