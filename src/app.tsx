import { Overlays, useRoute } from './ui';
import { Data, Exercises, History, Home, Routines, Summary } from './screens';
import { SessionScreen } from './session';
import { Progress } from './progress';

const TABS: [string, string, string][] = [
  ['/', 'Train', '◉'],
  ['/history', 'History', '▦'],
  ['/routines', 'Routines', '☰'],
  ['/progress', 'Progress', '↗'],
  ['/exercises', 'Lifts', '⚒'],
  ['/data', 'Data', '⛁'],
];

export function App() {
  const route = useRoute();
  const m = route.match(/^\/(session|summary)\/(.+)$/);
  let screen;
  if (m?.[1] === 'session') screen = <SessionScreen id={m[2]} key={m[2]} />;
  else if (m?.[1] === 'summary') screen = <Summary id={m[2]} key={m[2]} />;
  else if (route === '/history') screen = <History />;
  else if (route === '/routines') screen = <Routines />;
  else if (route === '/exercises') screen = <Exercises />;
  else if (route === '/progress') screen = <Progress />;
  else if (route === '/data') screen = <Data />;
  else screen = <Home />;

  return (
    <>
      {screen}
      {!m && (
        <nav class="tabs" aria-label="Main">
          {TABS.map(([path, label, icon]) => (
            <a key={path} href={'#' + path} class={route === path ? 'on' : ''} aria-current={route === path ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>{label}
            </a>
          ))}
        </nav>
      )}
      <Overlays />
    </>
  );
}
