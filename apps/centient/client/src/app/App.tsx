// App shell: the lock screen while the app lock is up, else first run, then four screens behind a tab bar,
// inside Konsta's iOS theme. A tab change redraws
// the screen with a random retro effect (TV, glitch or render).
import { useIsRestoring } from '@tanstack/react-query';
import { App as KonstaApp } from 'konsta/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAutoLock } from '../features/lock/useAutoLock';
import { BottomNav, type Screen } from '../layouts/BottomNav';
import { endToast, Toast } from '../ui/Toast';
import { signedOut } from '../lib/api';
import { locked } from '../lib/lockState';
import { attempt } from '../lib/run';
import { Home } from '../screens/Home';
import { me } from '../lib/state';
import { waitingLib } from '../models/useWaiting';
import { loadBasics, seedBasics, useBasicsLive } from '../models/workspace';
import { randomFx, type Fx } from '../ui/night/tv';

// Only Home is in the first download. The first run loads when it shows; the other tabs load while the phone is
// idle after the first paint (or at once when tapped first).
// The lock screen is fetched only on a device that uses the lock.
const LockScreen = lazy(() =>
  import('../features/lock/LockScreen').then(m => ({ default: m.LockScreen })),
);
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
  // While locked nothing loads and nothing of the app is on screen; unlocking starts it as a fresh open would.
  const isLocked = locked.value;
  useAutoLock();
  useBasicsLive(!restoring && !isLocked);
  useEffect(() => {
    if (restoring || isLocked) return;
    if (seedBasics()) setReady(true);
    attempt(loadBasics).then(() => setReady(true));
    whenIdle(
      () =>
        void Promise.all([loadMoney(), loadInsights(), loadSettings(), waitingLib()]).catch(
          () => {},
        ),
    );
  }, [restoring, isLocked]);
  useEffect(() => {
    if (prev.current !== screen) {
      endToast(); // a delete waiting on Undo is sent now, so this screen's balances include it
      setFx(randomFx());
      scrollTo(0, 0);
    }
    prev.current = screen;
  }, [screen]);

  return (
    <KonstaApp theme="ios" safeAreas>
      {isLocked ? (
        <Suspense fallback={null}>
          <LockScreen />
        </Suspense>
      ) : !ready || !me.value ? null : !me.value.workspace.onboarded_at ? (
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
      {/* The sign-in ran out while the app was open (lib/api). A Home Screen app has no reload button, so this
          is it: the reload meets Cloudflare Access's sign-in page. Above dialogs (9000), below the toast. */}
      {signedOut.value && (
        <button
          type="button"
          className="fixed inset-x-0 top-0 z-[9400] bg-pink px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] text-[15px] text-white"
          onClick={() => location.reload()}
        >
          Signed out. Tap to sign in again.
        </button>
      )}
      <Toast />
    </KonstaApp>
  );
}
