// HTTP test: the real Hono app over the SQLite D1 shim, signed in through the localhost dev bypass.
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { migrationsSql, testD1 } from './d1shim';

let env: { DB: D1Database; DEV_EMAIL: string };
beforeAll(() => { env = { DB: testD1(migrationsSql()), DEV_EMAIL: 'http@test' }; });

const call = async (method: string, path: string, body?: unknown, raw?: string) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  }, env);
  return { status: res.status, body: await res.json() as any };
};

describe('http', () => {
  it('rejects requests that are not signed in', async () => {
    const res = await app.request('https://example.com/api/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('maps bad input to VALIDATION and unknown routes to NOT_FOUND', async () => {
    expect(await call('POST', '/api/transactions', { type: 'EXPENSE' })).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    expect(await call('POST', '/api/transactions', undefined, '{oops')).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    expect(await call('GET', '/api/entries?limit=0')).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    expect(await call('PATCH', '/api/budgets/x', { name: 'n' })).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it('refuses an unlisted currency without writing, and lets the client format every listed one', async () => {
    for (const currency of ['XXX', 'ABC', '']) {
      expect(await call('POST', '/api/accounts', { name: `Bad ${currency}`, kind: 'BANK', currency })).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    }
    const { body: catalog } = await call('GET', '/api/catalog');
    expect(catalog.accounts.some((a: { name: string }) => a.name.startsWith('Bad'))).toBe(false);
    expect((await env.DB.prepare("SELECT code FROM currencies WHERE code IN ('XXX', 'ABC')").all()).results).toEqual([]);
    const food = catalog.categories.find((c: { name: string }) => c.name === 'Food & Drink').id;
    expect(await call('PUT', '/api/budgets', { categoryId: food, currency: 'XXX', limit: 500 })).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    const { body: me } = await call('GET', '/api/me');
    expect(me.currencies).toMatchObject({ JPY: 0, KWD: 3, IDR: 0, USD: 2, USDT: 6, BTC: 8 });
  });

  it('checks temporary budget input', async () => {
    expect((await app.request('https://example.com/api/budgets/history', {}, env)).status).toBe(401);
    const { body: catalog } = await call('GET', '/api/catalog');
    const food = catalog.categories.find((c: { name: string }) => c.name === 'Food & Drink').id;
    for (const startsOn of ['2099-02-31', '2099-13-01', '1/12/2099']) {
      expect(await call('PUT', '/api/budgets', { categoryId: food, limit: 500, startsOn, days: 14 })).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    }
    for (const days of [1, 91, 2.5, '14']) {
      expect(await call('PUT', '/api/budgets', { categoryId: food, limit: 500, startsOn: '2099-01-01', days })).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
    }
    expect(await call('DELETE', '/api/budgets/nope')).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    expect(await call('GET', '/api/budgets/history')).toMatchObject({ status: 200, body: [] });
  });

  it('logs, edits, updates a balance and deletes through the API', async () => {
    const { body: catalog } = await call('GET', '/api/catalog');
    const { body: { today } } = await call('GET', '/api/me');
    const coffee = catalog.categories.find((c: { name: string }) => c.name === 'Food & Drink').id;
    const { body: account } = await call('POST', '/api/accounts', { name: 'GoPay', kind: 'EWALLET', openingBalance: 100_000 });
    expect(await call('PATCH', `/api/accounts/${account.id}`, { name: 'Gopay' })).toMatchObject({ status: 200 });

    const cmd = { type: 'EXPENSE', accountId: account.id, categoryId: coffee, amount: 25_000, date: today, merchant: 'Kopi Kenangan' };
    const { status, body: { ids: [id] } } = await call('POST', '/api/transactions', cmd);
    expect(status).toBe(201);
    expect(await call('PATCH', `/api/entries/${id}`, { ...cmd, amount: 30_000 })).toMatchObject({ status: 200 });

    const { body: entries } = await call('GET', `/api/entries?account=${account.id}`);
    expect(entries.items.map((e: { kind: string }) => e.kind).sort()).toEqual(['OPENING', 'USER']);
    expect(entries.items.find((e: { id: string }) => e.id === id).command).toMatchObject({ amount: 30_000 });

    expect(await call('POST', `/api/accounts/${account.id}/balance`, { actual: 60_000, categoryId: coffee })).toMatchObject({ status: 200, body: { balance: 60_000 } });
    expect(await call('DELETE', `/api/entries/${id}`)).toMatchObject({ status: 200 });
    const { body: ctx } = await call('GET', '/api/quickadd/context');
    expect(ctx).toMatchObject({ today, lastAccountId: account.id });
    expect(ctx.accounts.some((a: { id: string }) => a.id === account.id)).toBe(true);
    const { body: balances } = await call('GET', '/api/balances');
    expect(balances.accounts.find((a: { id: string }) => a.id === account.id).balance).toBe(90_000);
  });

  it('deletes an account, downloads a backup and resets', async () => {
    const { body: acc } = await call('POST', '/api/accounts', { name: 'Jago', kind: 'BANK', openingBalance: 5_000 });
    expect(await call('PATCH', `/api/accounts/${acc.id}`, { kind: 'EWALLET', due_day: 5 })).toMatchObject({ status: 200 });
    expect(await call('DELETE', `/api/accounts/${acc.id}`)).toMatchObject({ status: 200 });
    expect(await call('DELETE', `/api/accounts/${acc.id}`)).toMatchObject({ status: 404 });
    const { status, body } = await call('GET', '/api/backup');
    expect(status).toBe(200);
    expect(body).toMatchObject({ format: 'centient-backup', version: 1 });
    const before = (await call('GET', '/api/me')).body.workspace.id;
    expect(await call('POST', '/api/workspace/reset')).toMatchObject({ status: 200 });
    expect((await call('GET', '/api/me')).body.workspace.id).not.toBe(before);
  });
});

