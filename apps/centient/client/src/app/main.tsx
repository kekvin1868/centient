import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import { App } from './App';
import '../styles.css';

createRoot(document.getElementById('app')!).render(<App />);
