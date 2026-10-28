// The board's camera: pan (x, y) and zoom z map world coordinates onto the screen. `glide` animates the next
// change (buttons, keys, fit); drags and pinches follow the finger without it.
import { useCallback, useRef, useState, type RefObject } from 'react';
import { clampZoom, zoomAt, type Camera } from './geometry';

export function useCamera(view: RefObject<HTMLElement | null>) {
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [gliding, setGliding] = useState(false);
  const timer = useRef(0);
  const glide = useCallback(() => {
    setGliding(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setGliding(false), 340);
  }, []);
  /** A client point relative to the board. */
  const local = useCallback((cx: number, cy: number): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [cx - r.left, cy - r.top];
  }, [view]);
  const toWorld = useCallback((cx: number, cy: number, c: Camera): [number, number] => {
    const [x, y] = local(cx, cy);
    return [(x - c.x) / c.z, (y - c.y) / c.z];
  }, [local]);
  const zoomBy = useCallback((f: number) => {
    const el = view.current!;
    glide();
    setCam(c => zoomAt(c, c.z * f, el.clientWidth / 2, el.clientHeight / 2));
  }, [view, glide]);
  const panBy = useCallback((dx: number, dy: number) => { glide(); setCam(c => ({ ...c, x: c.x + dx, y: c.y + dy })); }, [glide]);
  return { cam, setCam, gliding, glide, local, toWorld, zoomBy, panBy, clampZoom };
}
