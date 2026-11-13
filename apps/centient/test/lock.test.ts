// The app lock: what a locked browser may reach (the real Hono app over SQLite), and the service's rules around
// the passkey ceremonies. The ceremonies themselves need a real authenticator: e2e/lock.e2e.ts runs them.
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { migrationsSql, testD1 } from './d1shim';
import { world } from './world';

const NOW = Date.parse('2026-11-13T03:00:00Z');
const SITE = { host: 'localhost', origin: 'http://localhost' };

async function person(email = 'lock@test') {
  const w = world({ now: () => NOW });
  const { userId, workspaceId } = await w.repos.workspaces.ensure(email);
  const lock = () => w.svc(workspaceId, { id: userId, email }).lock;
  const addPasskey = () =>
    w.repos.lock.addPasskey(userId, { id: 'cred-1', public_key: 'AAAA', counter: 0 });
  const session = (ms = 3600_000) =>
    w.repos.lock.startSession(
      userId,
      new Date(NOW).toISOString(),
      new Date(NOW + ms).toISOString(),
    );
  return { w, userId, lock, addPasskey, session };
}

describe('lock service', () => {
  it('is off until a passkey exists, then needs a live session of this user', async () => {
    const t = await person();
    expect(await t.lock().status()).toEqual({ enabled: false, unlocked: true });
    await t.addPasskey();
    expect(await t.lock().status()).toEqual({ enabled: true, unlocked: false });
    expect(await t.lock().status('made-up')).toEqual({ enabled: true, unlocked: false });
    expect(await t.lock().status(await t.session())).toEqual({ enabled: true, unlocked: true });
    expect(await t.lock().status(await t.session(-1))).toEqual({ enabled: true, unlocked: false });

    const other = await t.w.repos.workspaces.ensure('someone@else');
    const theirs = t.w.svc(other.workspaceId, { id: other.userId, email: 'someone@else' }).lock;
    expect(await theirs.status(await t.session())).toEqual({ enabled: false, unlocked: true });
    await t.w.repos.lock.addPasskey(other.userId, { id: 'cred-2', public_key: 'BBBB', counter: 0 });
    expect((await theirs.status(await t.session())).unlocked).toBe(false);
  });

  it('gives the browser what it needs to make a passkey, for this site and person', async () => {
    const t = await person();
    const options = await t.lock().registerOptions(SITE);
    expect(options).toMatchObject({
      rp: { name: 'Centient', id: 'localhost' },
      user: { name: 'lock@test' },
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
    });
    expect(options.challenge.length).toBeGreaterThan(20);
  });

  it('refuses an answer that is not a passkey, and a challenge used twice', async () => {
    const t = await person();
    const bogus = { id: 'x', rawId: 'x', type: 'public-key' } as never;
    await t.lock().registerOptions(SITE);
    await expect(t.lock().register(SITE, bogus)).rejects.toMatchObject({ code: 'PASSKEY_REFUSED' });
    await expect(t.lock().register(SITE, bogus)).rejects.toMatchObject({ code: 'LOCK_EXPIRED' });
    expect((await t.lock().status()).enabled).toBe(false);
  });

  it('unlocks only with one of its own passkeys', async () => {
    const t = await person();
    await expect(t.lock().challenge(SITE)).rejects.toMatchObject({ code: 'LOCK_OFF' });
    await t.addPasskey();
    const options = await t.lock().challenge(SITE);
    expect(options).toMatchObject({
      rpId: 'localhost',
      userVerification: 'required',
      allowCredentials: [{ id: 'cred-1' }],
    });
    await expect(t.lock().unlock(SITE, { id: 'not-mine' } as never)).rejects.toMatchObject({
      code: 'PASSKEY_REFUSED',
    });
    await expect(t.lock().unlock(SITE, { id: 'cred-1' } as never)).rejects.toMatchObject({
      code: 'PASSKEY_REFUSED',
    });
  });

  it('while locked: no new passkey, no turning off; locking ends the session', async () => {
    const t = await person();
    await t.addPasskey();
    await expect(t.lock().registerOptions(SITE)).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(t.lock().turnOff()).rejects.toMatchObject({ code: 'LOCKED' });
    const id = await t.session();
    await t.lock().lock(id);
    expect((await t.lock().status(id)).unlocked).toBe(false);
    await t.lock().turnOff(await t.session());
    expect(await t.lock().status()).toEqual({ enabled: false, unlocked: true });
  });

  it('resets a lost passkey only right after a real sign-in', async () => {
    const t = await person();
    await t.addPasskey();
    const access = (minutesAgo: number) => ({
      email: 'lock@test',
      via: 'access' as const,
      signedInAt: NOW - minutesAgo * 60_000,
    });
    await expect(t.lock().reset(access(6))).rejects.toMatchObject({ code: 'SIGN_IN_AGAIN' });
    await expect(
      t.lock().reset({ email: 'lock@test', via: 'dev', signedInAt: null }),
    ).rejects.toMatchObject({ code: 'SIGN_IN_AGAIN' });
    await expect(
      t.lock().reset({ email: 'lock@test', via: 'service', signedInAt: NOW }),
    ).rejects.toMatchObject({ code: 'SIGN_IN_AGAIN' });
    expect((await t.lock().status()).enabled).toBe(true);
    await t.lock().reset(access(4));
    expect((await t.lock().status()).enabled).toBe(false);
  });
});

describe('a locked browser over http', () => {
  it('reaches only /api/lock until it holds a session cookie', async () => {
    const db = testD1(migrationsSql());
    const env = { DB: db, DEV_EMAIL: 'http-lock@test' };
    const get = (path: string, cookie?: string) =>
      app.request(`http://localhost${path}`, { headers: cookie ? { Cookie: cookie } : {} }, env);

    expect((await get('/api/me')).status).toBe(200);
    const w = world({ db, now: Date.now });
    const { userId } = await w.repos.workspaces.ensure('http-lock@test');
    await w.repos.lock.addPasskey(userId, { id: 'cred-1', public_key: 'AAAA', counter: 0 });

    const locked = await get('/api/me');
    expect(locked.status).toBe(423);
    expect(await locked.json()).toMatchObject({ code: 'LOCKED' });
    expect((await get('/api/balances')).status).toBe(423);
    expect(await (await get('/api/lock')).json()).toEqual({ enabled: true, unlocked: false });
    expect(
      (await app.request('http://localhost/api/lock/challenge', { method: 'POST' }, env)).status,
    ).toBe(200);

    const session = await w.repos.lock.startSession(
      userId,
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect((await get('/api/me', `unlock=${session}`)).status).toBe(200);

    const relock = await app.request(
      'http://localhost/api/lock/lock',
      { method: 'POST', headers: { Cookie: `unlock=${session}` } },
      env,
    );
    expect(relock.headers.get('set-cookie')).toMatch(/^unlock=;/);
    expect((await get('/api/me', `unlock=${session}`)).status).toBe(423);
  });
});
