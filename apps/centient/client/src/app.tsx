// App shell: first-run card, then three screens behind a bottom nav. /preview shows the design kit.
import { useEffect, useRef, useState } from 'preact/hooks';
import { BottomNav, type Screen } from './components/BottomNav';
import { Toast } from './components/Toast';
import { screenIn } from './lib/motion';
import { attempt } from './lib/run';
import { FirstRun } from './screens/FirstRun';
import { Home } from './screens/Home';
import { Money } from './screens/Money';
import { Preview } from './screens/Preview';
import { Settings } from './screens/Settings';
import { everyday, loadBasics, me } from './state';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [ready, setReady] = useState(false);
  const prev = useRef<Screen>('home');
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => { attempt(loadBasics).then(() => setReady(true)); }, []);
  useEffect(() => {
    if (main.current && prev.current !== screen) {
      screenIn(main.current);
      scrollTo(0, 0);
    }
    prev.current = screen;
  }, [screen]);

  if (location.pathname === '/preview') return <><Preview /><Toast /></>;
  if (!ready || !me.value) return <Toast />;
  if (!everyday().length) return <><FirstRun onDone={() => setScreen('home')} /><Toast /></>;
  return (
    <>
      <div ref={main} key={screen}>
        {screen === 'home' && <Home onGoMoney={() => setScreen('money')} />}
        {screen === 'money' && <Money onShowAccount={() => setScreen('home')} />}
        {screen === 'settings' && <Settings />}
      </div>
      <BottomNav current={screen} onGo={setScreen} />
      <Toast />
    </>
  );
}
