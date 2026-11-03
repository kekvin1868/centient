import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import '../styles.css';
import '../ui/night/theme';
import { persistOptions, queryClient } from '../models/query';

createRoot(document.getElementById('app')!).render(
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <App />
  </PersistQueryClientProvider>,
);
