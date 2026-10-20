// Motion presets: short iOS-like movement, plain fades when the device asks for reduced motion.
import { animate } from 'motion';

const EASE = [0.32, 0.72, 0, 1] as const;
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function sheetIn(sheet: Element, scrim: Element) {
  animate(scrim, { opacity: [0, 1] }, { duration: 0.2 });
  if (reducedMotion()) return animate(sheet, { opacity: [0, 1] }, { duration: 0.2 });
  return animate(sheet, { transform: ['translateY(100%)', 'translateY(0)'] }, { duration: 0.32, ease: EASE });
}

export function sheetOut(sheet: Element, scrim: Element) {
  animate(scrim, { opacity: 0 }, { duration: 0.2 });
  if (reducedMotion()) return animate(sheet, { opacity: 0 }, { duration: 0.18 });
  return animate(sheet, { transform: 'translateY(100%)' }, { duration: 0.25, ease: EASE });
}

/** Screen change: a quick fade with a slight rise. Vertical only, so nothing is cut at the screen edges. */
export function screenIn(el: Element) {
  if (reducedMotion()) return animate(el, { opacity: [0, 1] }, { duration: 0.12 });
  return animate(el, { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.2, ease: EASE });
}

export function popIn(el: Element) {
  if (reducedMotion()) return animate(el, { opacity: [0, 1] }, { duration: 0.15 });
  return animate(el, { opacity: [0, 1], transform: ['translateY(8px) scale(0.98)', 'translateY(0) scale(1)'] }, { duration: 0.22, ease: EASE });
}
