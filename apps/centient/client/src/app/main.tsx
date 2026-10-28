import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import '../styles.css';
import '../ui/night/theme';

createRoot(document.getElementById('app')!).render(<App />);
