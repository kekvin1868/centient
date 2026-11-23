// The score count-up, the retro list animation (AutoAnimate plugin), swipeable rows and small motion helpers.
// Screens and dialogs animate with the retro effects in ui/night (useFx, fx-* classes).
import { animate } from 'motion';
import { useMotionValue, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const EASE = [0.32, 0.72, 0, 1] as const;
export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that rolls to its new value (an arcade score) instead of jumping. First render shows it as is. */
export function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    if (reducedMotion()) {
      setShown(target);
      return;
    }
    const run = animate(from, target, {
      duration: 0.8,
      ease: EASE,
      onUpdate: v => setShown(Math.round(v)),
    });
    return () => run.stop();
  }, [target]);
  return shown;
}

/** A light tap on phones that support it (Android); iPhone Safari has no vibration API, so this does nothing there. */
export const buzz = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed */
  }
};

/** AutoAnimate in the retro style: new rows render in from a scanline, removed rows collapse to a line and flash,
 *  and the rest step (not glide) to their new place. */
type Spot = { top: number; left: number };
// AutoAnimate passes the new place first, then the old one.
export const retroList = (
  el: Element,
  action: 'add' | 'remove' | 'remain',
  next?: Spot,
  prev?: Spot,
) => {
  if (action === 'add')
    return new KeyframeEffect(
      el,
      [
        { clipPath: 'inset(48% 100% 48% 0)', filter: 'brightness(3)' },
        { clipPath: 'inset(48% 0 48% 0)', filter: 'brightness(2.4)', offset: 0.35 },
        { clipPath: 'inset(0)', filter: 'brightness(1.5)', opacity: 0.7, offset: 0.7 },
        { clipPath: 'inset(0)', filter: 'none', opacity: 1 },
      ],
      { duration: 360, easing: 'steps(6)' },
    );
  if (action === 'remove')
    return new KeyframeEffect(
      el,
      [
        { clipPath: 'inset(0)' },
        { clipPath: 'inset(46% 0 46% 0)', filter: 'brightness(3)', offset: 0.4 },
        { clipPath: 'inset(48% 30% 48% 30%)', filter: 'brightness(4) invert(1)', offset: 0.7 },
        { clipPath: 'inset(50% 50% 50% 50%)', opacity: 0 },
      ],
      { duration: 320, easing: 'steps(4)' },
    );
  const dx = (prev?.left ?? 0) - (next?.left ?? 0),
    dy = (prev?.top ?? 0) - (next?.top ?? 0);
  return new KeyframeEffect(
    el,
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
    { duration: 220, easing: 'steps(4)' },
  );
};

/**
 * Tells a drag from a tap for the click that follows it: spread `guard` on the dragged element and skip the tap
 * while `dragged.current`. It reads the pointer itself (moved over 10px while pressed), not motion's onDragStart:
 * that one waits for an animation frame, and on a slow WebKit the click after letting go came first, so a swipe
 * opened the entry it swiped. Stays up until the next press.
 */
export function useDragGuard(axis: 'x' | 'y') {
  const dragged = useRef(false);
  const from = useRef(0);
  const at = (e: ReactPointerEvent) => (axis === 'x' ? e.clientX : e.clientY);
  const guard = {
    onPointerDownCapture: (e: ReactPointerEvent) => {
      dragged.current = false;
      from.current = at(e);
    },
    onPointerMoveCapture: (e: ReactPointerEvent) => {
      if (e.buttons && Math.abs(at(e) - from.current) > 10) dragged.current = true;
    },
  };
  return { dragged, guard };
}

/**
 * A list row that slides left `width` px to show its actions (an entry row, a hidden pocket). `open` follows the
 * list, so another row opening closes this one; a drag past 50px or a flick opens it, 30px back closes it.
 * Spread `drag` on the row's `m.div`. `dragged` is true during a drag, so a tap inside it is not a click.
 */
export function useSwipe(width: number, open: boolean, onSwipe: (open: boolean) => void) {
  const x = useMotionValue(0);
  const { dragged, guard } = useDragGuard('x');
  const settle = (to: number) =>
    animate(
      x,
      to,
      reducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 },
    );
  useEffect(() => {
    settle(open ? -width : 0);
  }, [open]);
  const drag = {
    style: { x },
    drag: 'x' as const,
    dragConstraints: { left: -width, right: 0 },
    dragElastic: { left: 0.15, right: 0.02 },
    dragMomentum: false,
    ...guard,
    onDragEnd: (_: unknown, info: PanInfo) => {
      const opening = info.offset.x < -50 || info.velocity.x < -350;
      const closing = info.offset.x > 30 || info.velocity.x > 350;
      const next = open ? !closing : opening;
      if (next !== open) {
        if (next) buzz();
        onSwipe(next);
      } else settle(open ? -width : 0);
    },
  };
  return { x, drag, dragged };
}
