import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import { App } from './app';
import './styles.css';

createRoot(document.getElementById('app')!).render(<App />);
