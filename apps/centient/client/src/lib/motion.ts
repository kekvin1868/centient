// Screen change motion and the score count-up; sheets, dialogs and toasts animate with Konsta's own transitions.
import { animate } from 'motion';
import { useEffect, useRef, useState } from 'react';

const EASE = [0.32, 0.72, 0, 1] as const;
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Screen change: a quick fade with a slight rise. Vertical only, so nothing is cut at the screen edges. */
export function screenIn(el: Element) {
  if (reducedMotion()) return animate(el, { opacity: [0, 1] }, { duration: 0.12 });
  return animate(el, { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.2, ease: EASE });
}

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
