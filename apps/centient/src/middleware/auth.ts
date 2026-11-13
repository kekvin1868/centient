// Identity: Cloudflare Access in production, a fixed email on localhost in development.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../context';

export type AuthEnv = {
  ACCESS_TEAM_DOMAIN?: string; // e.g. "yourteam.cloudflareaccess.com"
  ACCESS_AUD?: string; // the Access application's audience tag
  SERVICE_TOKEN_EMAIL?: string; // the user an Access service token (the Shortcut) acts as
  DEV_EMAIL?: string; // .dev.vars only; honoured on localhost, private LAN addresses and DEV_HOSTS
  DEV_HOSTS?: string; // .dev.vars only; comma-separated extra hosts, e.g. an ngrok domain behind ngrok OAuth
};

/**
 * Who a request is from, and how they got in: a person through Cloudflare Access (`signedInAt`: when that
 * sign-in happened, in ms), a service token acting as the owner (the Shortcut), or the development sign-in.
 */
export type Identity = {
  email: string;
  via: 'access' | 'service' | 'dev';
  signedInAt: number | null;
};

/** Every /api request must be signed in; sets c.var.email and c.var.identity. */
export const auth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const identity = await identify(c.req.raw, c.env);
  if (!identity)
    return c.json({ code: 'UNAUTHORIZED', message: 'Sign in through Cloudflare Access' }, 401);
  c.set('email', identity.email);
  c.set('identity', identity);
  await next();
};

/** Returns who is signed in, or null. */
export async function identify(req: Request, env: AuthEnv): Promise<Identity | null> {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  if (jwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const claims = await verifyAccessJwt(jwt, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (claims?.email)
      return { email: claims.email, via: 'access', signedInAt: (claims.iat ?? 0) * 1000 || null };
    if (claims?.common_name && env.SERVICE_TOKEN_EMAIL)
      return { email: env.SERVICE_TOKEN_EMAIL, via: 'service', signedInAt: null };
    return null;
  }
  // Development only: DEV_EMAIL and DEV_HOSTS live in .dev.vars, which is never deployed. The host
  // must be this machine, a private LAN address, or a host listed in DEV_HOSTS (a tunnel to a phone).
  const host = new URL(req.url).hostname;
  const devHosts = (env.DEV_HOSTS ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
  if (env.DEV_EMAIL && (isLocalHost(host) || devHosts.includes(host)))
    return { email: env.DEV_EMAIL, via: 'dev', signedInAt: null };
  return null;
}

const isLocalHost = (host: string) =>
  host === 'localhost' ||
  host === '127.0.0.1' ||
  /^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}$/.test(host);

type Claims = {
  email?: string;
  common_name?: string;
  aud: string | string[];
  exp: number;
  /** When the token was issued (seconds): the sign-in it came from. */
  iat?: number;
  iss: string;
};
let keyCache: { at: number; keys: Map<string, CryptoKey> } | null = null;

const b64url = (s: string) =>
  Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)),
    c => c.charCodeAt(0),
  );

async function accessKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  if (keyCache && Date.now() - keyCache.at < 3600e3) return keyCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    );
  }
  keyCache = { at: Date.now(), keys: map };
  return map;
}

/** Verifies an Access JWT: RS256 signature against the team's keys, audience, issuer and expiry. */
async function verifyAccessJwt(
  jwt: string,
  teamDomain: string,
  aud: string,
): Promise<Claims | null> {
  const [h, p, sig] = jwt.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { kid: string; alg: string };
    if (header.alg !== 'RS256') return null;
    const key = (await accessKeys(teamDomain)).get(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64url(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64url(p))) as Claims;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !auds.includes(aud) ||
      claims.exp * 1000 < Date.now() ||
      claims.iss !== `https://${teamDomain}`
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}
