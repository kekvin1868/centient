// App shell: first run, then three screens behind a tab bar, inside Konsta's iOS theme. A tab change redraws
// the screen with a random retro effect (TV, glitch or render).
import { App as KonstaApp } from 'konsta/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BottomNav, type Screen } from '../layouts/BottomNav';
import { Toast } from '../ui/Toast';
import { attempt } from '../lib/run';
import { Home } from '../screens/Home';
import { Money } from '../screens/Money';
import { Settings } from '../screens/Settings';
import { loadBasics, me } from '../lib/state';
import { randomFx, type Fx } from '../ui/night/tv';

// The first run's screens load only when it shows.
const FirstRun = lazy(() => import('../screens/FirstRun').then(m => ({ default: m.FirstRun })));

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [ready, setReady] = useState(false);
  const prev = useRef<Screen>('home');
  const [fx, setFx] = useState<Fx | null>(null);

  useEffect(() => { attempt(loadBasics).then(() => setReady(true)); }, []);
  useEffect(() => {
    if (prev.current !== screen) {
      setFx(randomFx());
      scrollTo(0, 0);
    }
    prev.current = screen;
  }, [screen]);

  return (
    <KonstaApp theme="ios" safeAreas>
      {!ready || !me.value ? null : !me.value.workspace.onboarded_at ? <Suspense fallback={null}><FirstRun onDone={() => setScreen('home')} /></Suspense> : (
        <>
          <div key={screen} className={fx ? `fx-in-${fx}` : ''}>
            {screen === 'home' && <Home onGoMoney={() => setScreen('money')} />}
            {screen === 'money' && <Money onShowAccount={() => setScreen('home')} />}
            {screen === 'settings' && <Settings />}
          </div>
          <BottomNav current={screen} onGo={setScreen} />
        </>
      )}
      <Toast />
    </KonstaApp>
  );
}
