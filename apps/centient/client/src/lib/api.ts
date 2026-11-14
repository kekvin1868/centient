// Typed API client: routes and their input/output types come from the Worker (AppType).
import { hc } from 'hono/client';
import type { AppType } from '../../../src/app';
import { signal } from '@preact/signals-react';
import { locked, rememberLock } from './lockState';

/** True once an answer said this browser is signed out. App shows the way back in: a reload meets the sign-in page. */
export const signedOut = signal(false);

// Marked as XHR so Cloudflare Access answers a sign-in that ran out with a plain 401. Without the header it
// redirects to its sign-in page on another origin, which fetch reports as a network failure: the app would
// say "no connection" and entries would wait for a signal that is already there.
export const client = hc<AppType>('/', {
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    if (res.status === 401) signedOut.value = true;
    return res;
  },
});

/** The request never reached the server (offline, tunnel down). The caller keeps the user's input. */
export class OfflineError extends Error {
  constructor() {
    super('No connection');
  }
}

/** Awaits a client call and returns its JSON, throwing the server's plain-language message (and its `code`) on failure. */
export async function call<T>(
  req: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> {
  let res: { ok: boolean; status: number; json(): Promise<T> };
  try {
    res = await req;
  } catch {
    throw new OfflineError();
  }
  // Signed out, said by Access (no JSON) or by the server: the same words and code either way. The outbox
  // keeps its items waiting on this code.
  if (res.status === 401)
    throw Object.assign(new Error('Signed out. Sign in again.'), {
      code: 'UNAUTHORIZED',
      status: 401,
    });
  // Not JSON: the answer came from something in between (a tunnel's "server is down" page, a sign-in page), not
  // from the server. Safari words the parse error "The string did not match the expected pattern."
  let data: T;
  try {
    data = await res.json();
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) {
    const { message, code } = (data ?? {}) as { message?: string; code?: string };
    // The app lock is on and this browser has not passed it (it may have been turned on from another device).
    if (code === 'LOCKED') {
      rememberLock(true);
      locked.value = true;
    }
    throw Object.assign(new Error(message ?? 'Something went wrong'), { code, status: res.status });
  }
  return data;
}
