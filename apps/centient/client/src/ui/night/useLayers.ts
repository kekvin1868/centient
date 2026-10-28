// One keyboard router for stacked night layers (a screen, a sheet over it, a board over that): only the topmost
// mounted layer gets keydown. Each layer handles its own Escape.
import { useEffect, useRef } from 'react';

type Handler = { current: (e: KeyboardEvent) => void };
const stack: Handler[] = [];
const route = (e: KeyboardEvent) => stack[stack.length - 1]?.current(e);

export function useLayerKeys(onKey: (e: KeyboardEvent) => void, on = true) {
  const ref = useRef(onKey);
  ref.current = onKey;
  useEffect(() => {
    if (!on) return;
    if (!stack.length) document.addEventListener('keydown', route);
    stack.push(ref);
    return () => {
      stack.splice(stack.indexOf(ref), 1);
      if (!stack.length) document.removeEventListener('keydown', route);
    };
  }, [on]);
}

/** True when a key press should go to a text field instead of a shortcut. */
export const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
