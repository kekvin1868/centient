// The score count-up, the retro list animation (AutoAnimate plugin) and small motion helpers. Screens and dialogs
// animate with the retro effects in ui/night (useFx, fx-* classes).
import { animate } from 'motion';
import { useEffect, useRef, useState } from 'react';

const EASE = [0.32, 0.72, 0, 1] as const;
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that rolls to its new value (an arcade score) instead of jumping. First render shows it as is. */
export function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    if (reducedMotion()) { setShown(target); return; }
    const run = animate(from, target, { duration: 0.8, ease: EASE, onUpdate: v => setShown(Math.round(v)) });
    return () => run.stop();
  }, [target]);
  return shown;
}

/** A light tap on phones that support it (Android); iPhone Safari has no vibration API, so this does nothing there. */
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };

/** AutoAnimate in the retro style: new rows render in from a scanline, removed rows collapse to a line and flash,
 *  and the rest step (not glide) to their new place. */
type Spot = { top: number; left: number };
// AutoAnimate passes the new place first, then the old one.
export const retroList = (el: Element, action: 'add' | 'remove' | 'remain', next?: Spot, prev?: Spot) => {
  if (action === 'add') return new KeyframeEffect(el, [
    { clipPath: 'inset(48% 100% 48% 0)', filter: 'brightness(3)' },
    { clipPath: 'inset(48% 0 48% 0)', filter: 'brightness(2.4)', offset: 0.35 },
    { clipPath: 'inset(0)', filter: 'brightness(1.5)', opacity: 0.7, offset: 0.7 },
    { clipPath: 'inset(0)', filter: 'none', opacity: 1 },
  ], { duration: 360, easing: 'steps(6)' });
  if (action === 'remove') return new KeyframeEffect(el, [
    { clipPath: 'inset(0)' },
    { clipPath: 'inset(46% 0 46% 0)', filter: 'brightness(3)', offset: 0.4 },
    { clipPath: 'inset(48% 30% 48% 30%)', filter: 'brightness(4) invert(1)', offset: 0.7 },
    { clipPath: 'inset(50% 50% 50% 50%)', opacity: 0 },
  ], { duration: 320, easing: 'steps(4)' });
  const dx = (prev?.left ?? 0) - (next?.left ?? 0), dy = (prev?.top ?? 0) - (next?.top ?? 0);
  return new KeyframeEffect(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'steps(4)' });
};
