// Tap, hold and horizontal swipe on one element. State lives per element (not per render), so a re-render in the
// middle of a gesture (hold selects the row) doesn't lose it. The row follows the finger while swiping.
import type { PointerEvent, MouseEvent } from 'react';

type Opts = { onTap: () => void; onHold?: () => void; onSwipe?: (dir: 'left' | 'right') => void };
type State = { x: number; y: number; dx: number; moved: boolean; swipe: boolean; held: boolean; timer: number };
const states = new WeakMap<Element, State>();
const HOLD_MS = 520, SWIPE_PX = 70;

export function gestureProps({ onTap, onHold, onSwipe }: Opts) {
  const reset = (el: HTMLElement) => { el.style.transition = ''; el.style.transform = ''; };
  return {
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const s: State = { x: e.clientX, y: e.clientY, dx: 0, moved: false, swipe: false, held: false, timer: 0 };
      if (onHold) s.timer = window.setTimeout(() => { s.held = s.moved = true; onHold(); }, HOLD_MS);
      states.set(el, s);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget, s = states.get(el);
      if (!s || (e.pointerType === 'mouse' && !e.buttons)) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) > 8) {
        s.moved = true;
        clearTimeout(s.timer);
        s.swipe = Boolean(onSwipe) && Math.abs(dx) > Math.abs(dy);
        if (s.swipe) el.setPointerCapture(e.pointerId);
      }
      if (s.swipe && !s.held) { s.dx = dx; el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget, s = states.get(el);
      if (!s) return;
      clearTimeout(s.timer);
      reset(el);
      if (s.swipe && Math.abs(s.dx) > SWIPE_PX) onSwipe!(s.dx < 0 ? 'left' : 'right');
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      const s = states.get(e.currentTarget);
      if (s) clearTimeout(s.timer);
      reset(e.currentTarget);
    },
    // A click after a hold or a drag is not a tap.
    onClick: (e: MouseEvent<HTMLElement>) => {
      const s = states.get(e.currentTarget);
      states.delete(e.currentTarget);
      if (!s?.moved) onTap();
    },
  };
}
