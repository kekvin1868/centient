// App shell: first-run card, then three screens behind a tab bar, inside Konsta's iOS theme.
import { App as KonstaApp } from 'konsta/react';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BottomNav, type Screen } from './components/BottomNav';
import { Toast } from './components/Toast';
import { screenIn } from './lib/motion';
import { attempt } from './lib/run';
import { FirstRun } from './screens/FirstRun';
import { Home } from './screens/Home';
import { Money } from './screens/Money';
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

  return (
    <KonstaApp theme="ios" safeAreas>
      {!ready || !me.value ? null : !everyday().length ? <FirstRun onDone={() => setScreen('home')} /> : (
        <>
          <div ref={main} key={screen}>
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
