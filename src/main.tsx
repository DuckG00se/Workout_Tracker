import { render } from 'preact';
import '@fontsource-variable/fraunces';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles.css';
import { App } from './app';
import { initDb } from './db';

initDb().finally(() => render(<App />, document.getElementById('app')!));
