// The app lock as this device knows it: whether the lock screen is up, and after how long away it comes back.
// No API here, so lib/api can raise the lock when the server answers LOCKED.
import { signal } from '@preact/signals-react';
import { load, save } from './storage';

/**
 * True while the lock screen is up. It starts true on a device that turned the lock on, so nothing of the app
 * (not even what this device saved from last time) shows before the passkey is checked.
 */
export const locked = signal<boolean>(load('lock', false));

/** Remembers whether this device uses the lock: it decides how the next start begins. */
export const rememberLock = (on: boolean) => save('lock', on);
export const usesLock = () => load('lock', false);

/** Minutes away from the app before it locks again; 0 = every time it is left. */
export const LOCK_AFTER = [0, 1, 5, 15] as const;
export const loadLockAfter = (): number => {
  const saved = load<number>('lockAfter', 1);
  return LOCK_AFTER.find(m => m === saved) ?? 1;
};
export const saveLockAfter = (minutes: number) => save('lockAfter', minutes);
