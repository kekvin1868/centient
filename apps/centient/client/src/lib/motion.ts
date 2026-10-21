// Screen change motion; sheets, dialogs and toasts animate with Konsta's own transitions.
import { animate } from 'motion';

const EASE = [0.32, 0.72, 0, 1] as const;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Screen change: a quick fade with a slight rise. Vertical only, so nothing is cut at the screen edges. */
export function screenIn(el: Element) {
  if (reducedMotion()) return animate(el, { opacity: [0, 1] }, { duration: 0.12 });
  return animate(el, { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.2, ease: EASE });
}
