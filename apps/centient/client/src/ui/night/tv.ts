// Timing for the night theme's TV effects. Waits shrink to almost nothing when the user asks for less motion.
import { useCallback, useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../../lib/motion';

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, reducedMotion() ? Math.min(ms, 30) : ms));

/** Exit animation before unmount: render with `leaving` (a TV switch-off class), await leave(), then go. */
export function useLeave(ms = 340) {
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(async () => { setLeaving(true); await wait(ms); }, [ms]);
  return [leaving, leave] as const;
}

/** Retro transitions, each an enter class and an exit class (fx-in-<name>, fx-out-<name>) in night.css:
 *  tv = a white line opens into the picture / collapses back to a dot; glitch = sliced, shifted, hue-torn;
 *  render = drawn in line by line under a scan bar / wiped away. */
export type Fx = 'tv' | 'glitch' | 'render';
const OUT_MS: Record<Fx, number> = { tv: 340, glitch: 270, render: 360 };
export const FX: Fx[] = ['tv', 'glitch', 'render'];
export const randomFx = (from: Fx[] = FX): Fx => from[Math.floor(Math.random() * from.length)];

/** An element that enters and leaves with one effect (random unless given): spread `cls` on it, await leave(). */
export function useFx(fixed?: Fx, from?: Fx[]) {
  const [fx] = useState(() => fixed ?? randomFx(from));
  const [leaving, leave] = useLeave(OUT_MS[fx]);
  return { fx, leaving, leave, cls: leaving ? `fx-out-${fx}` : `fx-in-${fx}` };
}

/** A dialog shown by an `open` flag: mounted while open and through its exit after it turns false. `gen` changes
 *  on every opening, so key the dialog by it to start fresh. Call unmount() when its exit has played. */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [gen, setGen] = useState(0);
  const was = useRef(open);
  // Only a real reopening starts fresh; remounting right after the first show would steal a field's focus.
  useEffect(() => {
    if (open && !was.current) { setMounted(true); setGen(g => g + 1); }
    was.current = open;
  }, [open]);
  return { mounted, gen, unmount: useCallback(() => setMounted(false), []) };
}
