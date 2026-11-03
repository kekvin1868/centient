// App shell: first run, then four screens behind a tab bar, inside Konsta's iOS theme. A tab change redraws
// the screen with a random retro effect (TV, glitch or render).
import { useIsRestoring } from '@tanstack/react-query';
import { App as KonstaApp } from 'konsta/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BottomNav, type Screen } from '../layouts/BottomNav';
import { Toast } from '../ui/Toast';
import { attempt } from '../lib/run';
import { Home } from '../screens/Home';
import { me } from '../lib/state';
import { loadBasics, seedBasics } from '../models/workspace';
import { randomFx, type Fx } from '../ui/night/tv';

// Only Home is in the first download. The first run loads when it shows; the other tabs load while the phone is
// idle after the first paint (or at once when tapped first).
const FirstRun = lazy(() => import('../screens/FirstRun').then(m => ({ default: m.FirstRun })));
const loadMoney = () => import('../screens/Money');
const loadInsights = () => import('../screens/Insights');
const loadSettings = () => import('../screens/Settings');
const Money = lazy(() => loadMoney().then(m => ({ default: m.Money })));
const Insights = lazy(() => loadInsights().then(m => ({ default: m.Insights })));
const Settings = lazy(() => loadSettings().then(m => ({ default: m.Settings })));
const whenIdle = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn) : setTimeout(fn, 1500);

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [ready, setReady] = useState(false);
  const prev = useRef<Screen>('home');
  const [fx, setFx] = useState<Fx | null>(null);

  // Wait for the device's saved cache; when it holds the basics, render from it at once and refresh behind it.
  const restoring = useIsRestoring();
  useEffect(() => {
    if (restoring) return;
    if (seedBasics()) setReady(true);
    attempt(loadBasics).then(() => setReady(true));
    whenIdle(() => void Promise.all([loadMoney(), loadInsights(), loadSettings()]));
  }, [restoring]);
  useEffect(() => {
    if (prev.current !== screen) {
      setFx(randomFx());
      scrollTo(0, 0);
    }
    prev.current = screen;
  }, [screen]);

  return (
    <KonstaApp theme="ios" safeAreas>
      {!ready || !me.value ? null : !me.value.workspace.onboarded_at ? (
        <Suspense fallback={null}>
          <FirstRun onDone={() => setScreen('home')} />
        </Suspense>
      ) : (
        <>
          <div key={screen} className={fx ? `fx-in-${fx}` : ''}>
            <Suspense fallback={null}>
              {screen === 'home' && <Home onGoMoney={() => setScreen('money')} />}
              {screen === 'money' && <Money onShowAccount={() => setScreen('home')} />}
              {screen === 'insights' && <Insights />}
              {screen === 'settings' && <Settings />}
            </Suspense>
          </div>
          <BottomNav current={screen} onGo={setScreen} />
        </>
      )}
      <Toast />
    </KonstaApp>
  );
}
