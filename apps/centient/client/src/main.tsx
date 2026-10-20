import { render } from 'preact';
import '@fontsource-variable/geist';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);
