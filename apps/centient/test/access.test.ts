// The production sign-in: a Cloudflare Access token is taken only when its signature, audience, issuer and
// expiry hold, and a token signed with a key newer than our saved copy is taken once the keys are fetched again.
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { identify } from '../src/middleware/auth';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-tag';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, SERVICE_TOKEN_EMAIL: 'owner@example.com' };
const NOW = Date.parse('2026-11-14T03:00:00Z');

const b64url = (data: ArrayBuffer | string) =>
  Buffer.from(
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data),
  ).toString('base64url');

type Signer = { kid: string; jwk: JsonWebKey & { kid: string }; privateKey: CryptoKey };
async function signer(kid: string): Promise<Signer> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, jwk: { ...jwk, kid }, privateKey: pair.privateKey };
}

async function token(by: Signer, claims: Record<string, unknown> = {}) {
  const body = `${b64url(JSON.stringify({ alg: 'RS256', kid: by.kid }))}.${b64url(
    JSON.stringify({
      email: 'owner@example.com',
      aud: [AUD],
      iss: `https://${TEAM}`,
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
      ...claims,
    }),
  )}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    by.privateKey,
    new TextEncoder().encode(body),
  );
  return `${body}.${b64url(sig)}`;
}

const ask = (jwt: string) =>
  identify(
    new Request('https://cts.example.workers.dev/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    }),
    env,
  );

let published: Signer[] = [];
let fetches = 0;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubGlobal('fetch', async (url: string) => {
    expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    fetches++;
    return Response.json({ keys: published.map(s => s.jwk) });
  });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('an Access token: who it names, and every way it is refused', async () => {
  const first = await signer('key-1');
  published = [first];

  expect(await ask(await token(first))).toEqual({
    email: 'owner@example.com',
    via: 'access',
    signedInAt: NOW,
  });
  // A service token (the Shortcut) has no email: it acts as the owner.
  expect(await ask(await token(first, { email: undefined, common_name: 'shortcut' }))).toEqual({
    email: 'owner@example.com',
    via: 'service',
    signedInAt: null,
  });

  expect(await ask(await token(first, { aud: ['another-app'] }))).toBeNull();
  expect(await ask(await token(first, { iss: 'https://evil.cloudflareaccess.com' }))).toBeNull();
  expect(await ask(await token(first, { exp: NOW / 1000 - 1 }))).toBeNull();
  // Signed by a key Access never published, under a published key's id.
  const forger = await signer('key-1');
  expect(await ask(await token(forger))).toBeNull();
  expect(fetches).toBe(1); // the keys were fetched once for all of the above

  // Access moves to a new key. Inside a minute of our last fetch an unknown id is refused without fetching
  // (a made-up id cannot make every request fetch); after it, the keys are fetched again and the token holds.
  const second = await signer('key-2');
  published = [first, second];
  expect(await ask(await token(second))).toBeNull();
  expect(fetches).toBe(1);
  vi.setSystemTime(NOW + 61_000);
  expect((await ask(await token(second)))?.email).toBe('owner@example.com');
  expect(fetches).toBe(2);
});

test('no Access settings and no dev sign-in: nobody', async () => {
  const req = new Request('https://cts.example.workers.dev/api/me');
  expect(await identify(req, {})).toBeNull();
  // The dev sign-in never works on a public host, even if DEV_EMAIL leaked into production.
  expect(await identify(req, { DEV_EMAIL: 'dev@localhost' })).toBeNull();
});
