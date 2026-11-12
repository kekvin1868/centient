import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LazyMotion } from 'motion/react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import '../styles.css';
import '../ui/night/theme';
import { registerServiceWorker } from '../lib/serviceWorker';
import { persistOptions, queryClient } from '../models/query';

registerServiceWorker();

createRoot(document.getElementById('app')!).render(
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={persistOptions}
    // The saved data paints at once; it may be older than this device knows (another device, a reset), so it is
    // marked stale and what's on screen refreshes behind it.
    onSuccess={() => queryClient.invalidateQueries()}
  >
    <LazyMotion features={() => import('./motionFeatures').then(r => r.default)} strict>
      <App />
    </LazyMotion>
  </PersistQueryClientProvider>,
);
