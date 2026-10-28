// Title: NieR:Automata's loading screen on a loop (warm dark mesh, spaced LOADING) with the turning coin, the
// wordmark and a blinking CLICK TO START. A press freezes it, then the screen switches off like an old TV.
import { useRef, useState } from 'react';
import { Coin3D } from '../../../ui/Coin3D';
import { Wordmark } from '../../../ui/Logo';
import { useLeave, wait } from '../../../ui/night/tv';
import { useLayerKeys } from '../../../ui/night/useLayers';

export function TitleScreen({ onStart }: { onStart: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [leaving, leave] = useLeave(440);
  const started = useRef(false);
  const go = async () => {
    if (started.current) return;
    started.current = true;
    setPressed(true);
    await wait(420);
    await leave();
    onStart();
  };
  useLayerKeys(e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return (
    <div className={`scene n-dark t-title ${pressed ? 'pressed' : ''} ${leaving ? 'tv-out' : ''}`} onClick={go}>
      <div className="ld-bg" />
      <div className="ld-head" aria-hidden="true"><span className="ld-t">LOADING</span><span className="ld-sub">- BOOTING SYSTEM<i className="ld-dots" /></span></div>
      <div className="t-stage">
        <div className="t-coin"><Coin3D paused={pressed} /></div>
        <Wordmark className="t-word" />
        <button type="button" className="t-press">CLICK TO START</button>
      </div>
    </div>
  );
}
