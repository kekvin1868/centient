import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LazyMotion } from 'motion/react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import '../styles.css';
import '../ui/night/theme';
import { registerServiceWorker } from '../lib/serviceWorker';
import { outbox, watchOutbox } from '../models/outbox';
import { persistOptions, queryClient } from '../models/query';

registerServiceWorker();
// Entry changes kept from last time go out now, and whenever the signal or the app comes back.
watchOutbox();
void outbox.flush();

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
