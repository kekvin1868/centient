// The offline queue's server half, over HTTP: a save sent twice is taken once (by its ticket and by the id the
// phone gave the entry), an edit made against an old version is refused, and old tickets are forgotten.
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { ticketsRepo } from '../src/repos/tickets';
import { migrationsSql, testD1 } from './d1shim';

let env: { DB: D1Database; DEV_EMAIL: string };
let bca: string;
let food: string;

const call = async (method: string, path: string, body?: unknown, key?: string) => {
  const res = await app.request(
    `http://localhost${path}`,
    {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    env,
  );
  return {
    status: res.status,
    body: (await res.json()) as any,
    replay: res.headers.get('Idempotent-Replay'),
  };
};
const kopi = (amount = 25_000) => ({
  type: 'EXPENSE',
  accountId: bca,
  categoryId: food,
  amount,
  date: '2026-11-13',
  merchant: 'kopi',
});
const entries = async () => (await call('GET', '/api/entries')).body.items as any[];
const spent = async () => (await entries()).filter(e => e.kind === 'USER').length;

beforeEach(async () => {
  env = { DB: testD1(migrationsSql()), DEV_EMAIL: 'tickets@test' };
  const { body: catalog } = await call('GET', '/api/catalog');
  food = catalog.categories.find((c: any) => c.name === 'Food & Drink').id;
  bca = (
    await call('POST', '/api/accounts', { name: 'BCA', kind: 'BANK', openingBalance: 500_000 })
  ).body.id;
});

describe('tickets', () => {
  it('answers a repeat with the first answer and saves once', async () => {
    const first = await call('POST', '/api/transactions', kopi(), 't-1');
    expect(first).toMatchObject({ status: 201, replay: null });
    const second = await call('POST', '/api/transactions', kopi(), 't-1');
    expect(second).toMatchObject({ status: 201, replay: 'true', body: first.body });
    expect(await spent()).toBe(1);
  });

  it('refuses a ticket reused for another save', async () => {
    await call('POST', '/api/transactions', kopi(), 't-1');
    expect(await call('POST', '/api/transactions', kopi(30_000), 't-1')).toMatchObject({
      status: 422,
      body: { code: 'TICKET_REUSED' },
    });
    expect(await spent()).toBe(1);
  });

  it('saves without a ticket as before, twice', async () => {
    await call('POST', '/api/transactions', kopi());
    await call('POST', '/api/transactions', kopi());
    expect(await spent()).toBe(2);
  });

  it('does not remember a refusal: the same ticket works once the reason is gone', async () => {
    const bad = { ...kopi(), categoryId: 'nope' };
    expect((await call('POST', '/api/transactions', bad, 't-1')).status).toBe(404);
    expect((await call('POST', '/api/transactions', bad, 't-1')).replay).toBeNull();
    expect(await ticketsRepo(env.DB).get(await ws(), 't-1')).toBeNull();
  });

  it('lets one of two copies arriving together win, and answers the other from it', async () => {
    const [a, b] = await Promise.all([
      call('POST', '/api/transactions', kopi(), 't-1'),
      call('POST', '/api/transactions', kopi(), 't-1'),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.ids ?? [a.body.replayed]).toBeTruthy();
    expect(await spent()).toBe(1);
  });

  it('answers a save whose answer was never stored with a plain "saved"', async () => {
    // The write and its ticket landed, then the Worker died before the answer was kept.
    await ticketsRepo(env.DB)
      .claim(await ws(), 't-1', await fingerprint('POST', '/api/transactions', kopi()))
      .run();
    expect(await call('POST', '/api/transactions', kopi(), 't-1')).toMatchObject({
      status: 200,
      replay: 'true',
      body: { ok: true, replayed: true },
    });
    expect(await spent()).toBe(0);
  });

  it('forgets tickets older than the cut-off only', async () => {
    await call('POST', '/api/transactions', kopi(), 'new');
    await call('POST', '/api/transactions', kopi(), 'old');
    await env.DB.prepare(
      "UPDATE tickets SET created_at = datetime('now', '-31 days') WHERE key = 'old'",
    ).run();
    const cut = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(await ticketsRepo(env.DB).sweep(cut)).toBe(1);
    expect(await ticketsRepo(env.DB).get(await ws(), 'new')).not.toBeNull();
    expect(await ticketsRepo(env.DB).get(await ws(), 'old')).toBeNull();
  });
});

describe('entry ids made by the phone', () => {
  const id = '0b6c1b9e-3f0e-4c58-9a57-1d2f3a4b5c6d';
  const save = (key?: string, amount?: number) =>
    call('POST', '/api/quickadd/save', { items: [{ id, command: kopi(amount) }] }, key);

  it('keeps the id, and saves the same id once whatever the ticket', async () => {
    expect((await save('t-1')).body.ids).toEqual([id]);
    expect(await save('t-2')).toMatchObject({ status: 201, body: { ids: [id] } });
    expect(await save()).toMatchObject({ status: 201, body: { ids: [id] } });
    expect(await spent()).toBe(1);
  });

  it('never brings a deleted entry back', async () => {
    await save();
    await call('DELETE', `/api/entries/${id}`);
    expect((await save()).body.ids).toEqual([id]);
    expect(await spent()).toBe(0);
  });

  it('saves the new ones of a mixed batch', async () => {
    await save();
    const other = '1c7d2caf-4a1f-4d69-8b68-2e3a4b5c6d7e';
    const res = await call('POST', '/api/quickadd/save', {
      items: [
        { id, command: kopi() },
        { id: other, command: kopi(18_000) },
        { command: kopi(9_000) },
      ],
    });
    expect(res.body.ids.slice(0, 2)).toEqual([id, other]);
    expect(res.body.ids[2]).not.toBe(id);
    expect(await spent()).toBe(3);
  });

  it('refuses an id that is not a UUID', async () => {
    expect(
      (await call('POST', '/api/quickadd/save', { items: [{ id: 'x', command: kopi() }] })).status,
    ).toBe(400);
  });
});

describe('entry versions', () => {
  it('counts edits, refuses one made against an old version, and takes one with no base', async () => {
    const [id] = (await call('POST', '/api/transactions', kopi())).body.ids;
    expect((await call('GET', `/api/entries/${id}`)).body).toMatchObject({ id, version: 1 });

    expect(await call('PATCH', `/api/entries/${id}?base=1`, kopi(28_000))).toMatchObject({
      status: 200,
      body: { ok: true, version: 2 },
    });
    // The phone still holds version 1.
    expect(await call('PATCH', `/api/entries/${id}?base=1`, kopi(30_000))).toMatchObject({
      status: 409,
      body: { code: 'ENTRY_CHANGED' },
    });
    const now = (await call('GET', `/api/entries/${id}`)).body;
    expect(now).toMatchObject({ version: 2, command: { amount: 28_000 } });

    expect((await call('PATCH', `/api/entries/${id}`, kopi(30_000))).body.version).toBe(3);
    expect((await entries()).find(e => e.id === id)).toMatchObject({ version: 3 });
  });

  it('answers an edit of a deleted entry with NOT_FOUND', async () => {
    const [id] = (await call('POST', '/api/transactions', kopi())).body.ids;
    await call('DELETE', `/api/entries/${id}`);
    expect((await call('PATCH', `/api/entries/${id}?base=1`, kopi(1))).status).toBe(404);
    expect((await call('GET', `/api/entries/${id}`)).status).toBe(404);
  });

  it('a repeated edit with its ticket is not a clash with itself', async () => {
    const [id] = (await call('POST', '/api/transactions', kopi())).body.ids;
    await call('PATCH', `/api/entries/${id}?base=1`, kopi(28_000), 'e-1');
    expect(await call('PATCH', `/api/entries/${id}?base=1`, kopi(28_000), 'e-1')).toMatchObject({
      status: 200,
      replay: 'true',
      body: { version: 2 },
    });
  });
});

const ws = async () => (await call('GET', '/api/me')).body.workspace.id as string;
async function fingerprint(method: string, path: string, body: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const hash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${method} ${path} ${hash}`;
}
