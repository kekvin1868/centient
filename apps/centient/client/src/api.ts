// Typed API client: routes and their input/output types come from the Worker (AppType).
import { hc } from 'hono/client';
import type { AppType } from '../../src/interface/http';

export const client = hc<AppType>('/');

/** The request never reached the server (offline, tunnel down). The caller keeps the user's input. */
export class OfflineError extends Error {
  constructor() { super('No connection'); }
}

/** Awaits a client call and returns its JSON, throwing the server's plain-language message on failure. */
export async function call<T>(req: Promise<{ ok: boolean; json(): Promise<T> }>): Promise<T> {
  let res: { ok: boolean; json(): Promise<T> };
  try {
    res = await req;
  } catch {
    throw new OfflineError();
  }
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string })?.message ?? 'Something went wrong');
  return data;
}
