import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/fraunces';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles.css';
import { App } from './app';
import { initDb } from './db';

registerSW({ immediate: true });
initDb().finally(() => render(<App />, document.getElementById('app')!));
