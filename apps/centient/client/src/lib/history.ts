// A value with undo: every set() keeps the previous value (up to 80), undo() steps back one.
import { useCallback, useRef, useState } from 'react';

export function useHistory<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const past = useRef<T[]>([]);
  const set = useCallback((next: T) => {
    setValue(prev => {
      past.current.push(prev);
      if (past.current.length > 80) past.current.shift();
      return next;
    });
  }, []);
  /** Returns false when there is nothing to undo. */
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return false;
    setValue(prev);
    return true;
  }, []);
  return [value, set, undo] as const;
}
