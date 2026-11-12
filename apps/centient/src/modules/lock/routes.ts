// /api/lock: the app lock's ceremonies. These are the only routes a locked browser may call.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { json } from '../../lib/schemas';
import type { Site } from './service';

/** The cookie that names this browser's unlock session. */
export const UNLOCK_COOKIE = 'unlock';

const siteOf = (c: Context<AppEnv>): Site => {
  const url = new URL(c.req.url);
  return { host: url.hostname, origin: url.origin };
};
const session = (c: Context<AppEnv>) => getCookie(c, UNLOCK_COOKIE);
const keep = (c: Context<AppEnv>, id: string) =>
  setCookie(c, UNLOCK_COOKIE, id, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api',
    // Plain http only happens on this machine in development, where a Secure cookie would be dropped.
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: 12 * 3600,
  });
// The browser's answer is checked by the passkey library, not field by field here.
const answer = <T>() =>
  z.object({ response: z.custom<T>(v => typeof v === 'object' && v !== null) });

export const lockRoutes = new Hono<AppEnv>()
  .get('/', async c => c.json(await c.var.services.lock.status(session(c))))

  .post('/register/options', async c =>
    c.json(await c.var.services.lock.registerOptions(siteOf(c), session(c))),
  )

  .post('/register', json(answer<RegistrationResponseJSON>()), async c => {
    const { response } = c.req.valid('json');
    keep(c, await c.var.services.lock.register(siteOf(c), response, session(c)));
    return c.json({ ok: true });
  })

  .post('/challenge', async c => c.json(await c.var.services.lock.challenge(siteOf(c))))

  .post('/unlock', json(answer<AuthenticationResponseJSON>()), async c => {
    keep(c, await c.var.services.lock.unlock(siteOf(c), c.req.valid('json').response));
    return c.json({ ok: true });
  })

  .post('/lock', async c => {
    await c.var.services.lock.lock(session(c));
    deleteCookie(c, UNLOCK_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  })

  .post('/reset', async c => {
    await c.var.services.lock.reset(c.var.identity);
    return c.json({ ok: true });
  })

  .delete('/', async c => {
    await c.var.services.lock.turnOff(session(c));
    deleteCookie(c, UNLOCK_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });
