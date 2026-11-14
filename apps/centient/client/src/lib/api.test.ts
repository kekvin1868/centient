// A sign-in that ran out must read as "signed out", never as "no connection": the outbox waits on the code, and
// App shows the way back in.
import { afterEach, expect, test, vi } from 'vitest';
import { call, client, OfflineError, signedOut } from './api';

afterEach(() => vi.unstubAllGlobals());

test('a 401 from Cloudflare Access (no JSON) is signed out, with the code the outbox waits on', async () => {
  const seen: Request[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Request(new URL(String(input), 'https://app.example'), init));
    return new Response('<html>sign in</html>', { status: 401 });
  });
  signedOut.value = false;

  const failure = await call(client.api.me.$get()).catch((e: unknown) => e);

  expect(failure).not.toBeInstanceOf(OfflineError);
  expect(failure).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  expect(signedOut.value).toBe(true);
  // What makes Access answer 401 instead of redirecting to its sign-in page.
  expect(seen[0].headers.get('X-Requested-With')).toBe('XMLHttpRequest');
});

test('no answer at all is still "no connection"', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Load failed');
  });
  signedOut.value = false;
  await expect(call(client.api.me.$get())).rejects.toBeInstanceOf(OfflineError);
  expect(signedOut.value).toBe(false);
});
