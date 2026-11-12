// The app lock: its state on the server, and the passkey ceremonies. The passkey library is imported when a
// ceremony runs, so it is not part of Home's first download.
import { queryOptions } from '@tanstack/react-query';
import { locked, rememberLock } from '../lib/lockState';
import { call, client } from './api';

export const lockQueries = {
  all: () => ['lock'] as const,
  /** `enabled`: the person has a passkey; `unlocked`: this browser may read data. */
  status: () =>
    queryOptions({
      queryKey: [...lockQueries.all(), 'status'],
      queryFn: () => call(client.api.lock.$get()),
    }),
};

export const lockApi = {
  /** Turns the lock on: this device makes a passkey (it asks for Face ID, a fingerprint or the screen lock). */
  async turnOn() {
    const { startRegistration } = await import('@simplewebauthn/browser');
    const optionsJSON = await call(client.api.lock.register.options.$post());
    const response = await startRegistration({ optionsJSON });
    await call(client.api.lock.register.$post({ json: { response } }));
    rememberLock(true);
  },

  /** Checks the passkey and takes the lock screen down. */
  async unlock() {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const optionsJSON = await call(client.api.lock.challenge.$post());
    const response = await startAuthentication({ optionsJSON });
    await call(client.api.lock.unlock.$post({ json: { response } }));
    locked.value = false;
  },

  /** Puts the lock screen up and ends this browser's session on the server. */
  lock() {
    locked.value = true;
    return call(client.api.lock.lock.$post());
  },

  async turnOff() {
    await call(client.api.lock.$delete());
    rememberLock(false);
  },

  /** Lost passkey: turns the lock off without it; the server allows it only right after a new sign-in. */
  async reset() {
    await call(client.api.lock.reset.$post());
    rememberLock(false);
    locked.value = false;
  },
};
