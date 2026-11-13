// Bill reminders by Web Push: which notes a day calls for, the subscription rules, the daily job, and proof
// that what is sent is a real push message: the test plays the phone and decrypts it (RFC 8291).
import { describe, expect, it } from 'vitest';
import { remindDue } from '../src/cron';
import { dueNotes, money } from '../src/domain/reminders';
import { createSender } from '../src/modules/push/sender';
import { world } from './world';

const NOW = Date.parse('2026-11-13T03:00:00Z'); // 10:00 in Jakarta
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

/** A server key pair as `npx web-push generate-vapid-keys` prints it. */
async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return {
    subject: 'mailto:test@centient.test',
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateKey: jwk.d!,
  };
}

/** A browser's push subscription, with the private half a real phone keeps to itself. */
async function phone(endpoint = 'https://web.push.apple.com/abc') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const hkdf = async (salt: Uint8Array, ikm: ArrayBuffer, info: Uint8Array, length: number) =>
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
      length * 8,
    );
  const text = (s: string) => new TextEncoder().encode(s);
  return {
    subscription: { endpoint, p256dh: b64url(p256dh), auth: b64url(auth) },
    /** Decrypts an aes128gcm push body the way the browser does. */
    async read(body: Uint8Array): Promise<unknown> {
      const salt = body.slice(0, 16);
      const keyLength = body[20];
      const serverKey = body.slice(21, 21 + keyLength);
      const secret = await crypto.subtle.deriveBits(
        {
          name: 'ECDH',
          public: await crypto.subtle.importKey(
            'raw',
            serverKey,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
          ),
        },
        pair.privateKey,
        256,
      );
      const ikm = await hkdf(
        auth,
        secret,
        new Uint8Array([...text('WebPush: info\0'), ...p256dh, ...serverKey]),
        32,
      );
      const key = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12);
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce },
          await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']),
          body.slice(21 + keyLength),
        ),
      );
      // The message ends at the last 0x02; padding zeros follow it.
      return JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))));
    },
  };
}

/** A push service that records what it was sent and answers with `status`. */
function pushService(status = 201) {
  const posts: { url: string; headers: Record<string, string>; body: Uint8Array }[] = [];
  const fetch = (async (
    url: string,
    init: { headers: Record<string, string>; body: Uint8Array },
  ) => {
    posts.push({ url, headers: init.headers, body: init.body });
    return new Response(null, { status });
  }) as unknown as typeof globalThis.fetch;
  return { posts, fetch };
}

describe('which reminders a day calls for', () => {
  const bill = (o: object) => ({
    id: 'r1',
    name: 'Netflix',
    amount: 120_000,
    currency: 'IDR',
    nextDue: '2026-11-13',
    paused: false,
    ...o,
  });
  const card = (o: object) => ({
    accountId: 'c1',
    name: 'BCA Card',
    currency: 'IDR',
    dueOn: '2026-11-16',
    left: 700_000,
    ...o,
  });
  const notes = (bills: object[], cards: object[] = []) =>
    dueNotes(bills as never, cards as never, '2026-11-13', '2026-11-16');

  it('reminds on the day and three days before, never for a paused bill', () => {
    expect(
      notes([
        bill({}),
        bill({ id: 'r2', name: 'PLN', amount: null, nextDue: '2026-11-16' }),
        bill({ id: 'r3', nextDue: '2026-11-15' }),
        bill({ id: 'r4', nextDue: '2026-11-12' }),
        bill({ id: 'r5', paused: true }),
      ]),
    ).toEqual([
      { title: 'Netflix is due today', body: 'Rp120.000', tag: 'bill:r1:2026-11-13' },
      { title: 'PLN is due in 3 days', body: 'The amount varies', tag: 'bill:r2:2026-11-16' },
    ]);
  });

  it('reminds of a card bill while money is left to pay', () => {
    expect(
      notes([], [card({}), card({ accountId: 'c2', left: 0 }), card({ dueOn: null })]),
    ).toEqual([
      {
        title: 'BCA Card bill is due in 3 days',
        body: 'Rp700.000 left to pay',
        tag: 'card:c1:2026-11-16',
      },
    ]);
  });

  it('writes money the way the screens do', () => {
    expect(money(1_250_000, 'IDR')).toBe('Rp1.250.000');
    expect(money(500, 'IDR')).toBe('Rp500');
    expect(money(2050, 'USD')).toBe('USD 20.50');
  });
});

describe('a sent notification', () => {
  it('is a real push message: only the phone it is for can read it', async () => {
    const service = pushService();
    const sender = createSender(await vapidKeys(), service.fetch);
    const mine = await phone();
    const note = { title: 'Netflix is due today', body: 'Rp120.000', tag: 'bill:r1', url: '/' };
    expect(await sender.send([mine.subscription], note)).toEqual([]);

    const [post] = service.posts;
    expect(post.url).toBe('https://web.push.apple.com/abc');
    expect(post.headers).toMatchObject({ 'content-encoding': 'aes128gcm', ttl: '86400' });
    expect(post.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, ?k=[\w-]+$/);
    expect(await mine.read(post.body)).toEqual(note);
    await expect((await phone()).read(post.body)).rejects.toThrow();
  });

  it('reports the phones the push service says are gone, and survives one that fails', async () => {
    const sender = createSender(await vapidKeys(), pushService(410).fetch);
    const gone = await phone('https://fcm.googleapis.com/fcm/send/x');
    expect(
      await sender.send([gone.subscription], { title: 't', body: 'b', tag: 'x', url: '/' }),
    ).toEqual(['https://fcm.googleapis.com/fcm/send/x']);
    const broken = createSender(await vapidKeys(), pushService(500).fetch);
    const bad = { endpoint: 'https://web.push.apple.com/y', p256dh: 'not-a-key', auth: 'x' };
    expect(
      await broken.send([bad, gone.subscription], { title: 't', body: 'b', tag: 'x', url: '/' }),
    ).toEqual([]);
  });
});

describe('push service', () => {
  async function person(sender?: ReturnType<typeof createSender>) {
    const w = world({ now: () => NOW });
    const { userId, workspaceId } = await w.repos.workspaces.ensure('push@test');
    const push = () =>
      // The same wiring as a request, with or without VAPID keys.
      w.svc(workspaceId, { id: userId, email: 'push@test' }, sender).push;
    return { w, userId, push };
  }

  it('is off without server keys', async () => {
    const t = await person();
    expect(t.push().info()).toEqual({ available: false, publicKey: null });
    await expect(
      t.push().subscribe({ endpoint: 'https://web.push.apple.com/a', p256dh: 'k', auth: 'a' }),
    ).rejects.toMatchObject({ code: 'PUSH_OFF' });
    await expect(t.push().test()).rejects.toMatchObject({ code: 'PUSH_OFF' });
  });

  it('keeps one subscription per browser and only for known push services', async () => {
    const keys = await vapidKeys();
    const service = pushService();
    const t = await person(createSender(keys, service.fetch));
    expect(t.push().info()).toEqual({ available: true, publicKey: keys.publicKey });
    const mine = await phone();
    for (const endpoint of ['http://web.push.apple.com/a', 'https://evil.test/a', 'nope'])
      await expect(t.push().subscribe({ ...mine.subscription, endpoint })).rejects.toMatchObject({
        code: 'PUSH_ENDPOINT',
      });
    await t.push().subscribe(mine.subscription);
    await t.push().subscribe(mine.subscription);
    expect(await t.w.repos.push.ofUser(t.userId)).toHaveLength(1);

    expect(await t.push().test()).toEqual({ sent: 1 });
    expect(await mine.read(service.posts[0].body)).toMatchObject({ title: 'Reminders are on' });
    await t.push().unsubscribe(mine.subscription.endpoint);
    expect(await t.w.repos.push.ofUser(t.userId)).toEqual([]);
  });
});

describe('the daily job', () => {
  it('sends each due bill to each subscribed phone of its workspace, and forgets gone phones', async () => {
    const w = world({ now: () => NOW });
    const { userId, workspaceId: ws } = await w.repos.workspaces.ensure('cron@test');
    const svc = w.svc(ws, { id: userId, email: 'cron@test' });
    const bca = await svc.accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
    const fun = (await w.repos.categories.list(ws)).find(c => c.name === 'Fun')!.id;
    const add = (name: string, nextDue: string) =>
      svc.recurring.create({
        name,
        accountId: bca.id,
        categoryId: fun,
        amount: 120_000,
        everyMonths: 1,
        nextDue,
      });
    await add('Netflix', '2026-11-13');
    await add('Spotify', '2026-11-16');
    await add('Later', '2026-11-20');
    const mine = await phone();
    const old = await phone('https://fcm.googleapis.com/fcm/send/old');
    await w.repos.push.save(userId, mine.subscription);
    // Someone else, subscribed, with nothing due: hears nothing.
    const other = await w.repos.workspaces.ensure('quiet@test');
    await w.repos.push.save(
      other.userId,
      (await phone('https://web.push.apple.com/q')).subscription,
    );

    const env = { DB: w.db, ...(await vapidKeys()) };
    const keys = {
      VAPID_SUBJECT: env.subject,
      VAPID_PUBLIC_KEY: env.publicKey,
      VAPID_PRIVATE_KEY: env.privateKey,
    };
    const service = pushService();
    expect(await remindDue({ DB: w.db, ...keys }, NOW, service.fetch)).toBe(2);
    expect(await Promise.all(service.posts.map(p => mine.read(p.body)))).toEqual([
      {
        title: 'Netflix is due today',
        body: 'Rp120.000',
        tag: expect.stringMatching(/^bill:/),
        url: '/',
      },
      {
        title: 'Spotify is due in 3 days',
        body: 'Rp120.000',
        tag: expect.stringMatching(/^bill:/),
        url: '/',
      },
    ]);

    // Without keys the job does nothing; a phone the service calls gone is dropped.
    expect(await remindDue({ DB: w.db }, NOW, service.fetch)).toBe(0);
    await w.repos.push.remove(userId, mine.subscription.endpoint);
    await w.repos.push.save(userId, old.subscription);
    expect(await remindDue({ DB: w.db, ...keys }, NOW, pushService(410).fetch)).toBe(0);
    expect(await w.repos.push.ofUser(userId)).toEqual([]);
  });
});
