// Brings the lock back by itself: when the app starts locked (any session left from last time is ended), and
// when it is opened again after being away longer than the "Lock when away for" setting.
import { useEffect } from 'react';
import { loadLockAfter, locked, usesLock } from '../../lib/lockState';
import { lockApi } from '../../models/lock';

export function useAutoLock() {
  useEffect(() => {
    // Ending the session is best effort: offline, the lock screen is still up and the session runs out.
    const lock = () => void lockApi.lock().catch(() => {});
    if (locked.peek()) lock();
    let leftAt = 0;
    const onChange = () => {
      if (document.hidden) leftAt = Date.now();
      else if (usesLock() && !locked.peek() && Date.now() - leftAt >= loadLockAfter() * 60_000)
        lock();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
}
