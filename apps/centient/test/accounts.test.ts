// Accounts in any listed currency: the currencies row appears on first use, once, in the same write.
import { beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './world';

let w: World;
const svc = (ws: string) => w.svc(ws);
// Tuesday 10 Nov 2026, 10:00 in Jakarta.
const NOW = Date.parse('2026-11-10T03:00:00Z');

beforeAll(() => {
  w = world({ now: () => NOW });
});

const ensure = async (email: string) => (await w.repos.workspaces.ensure(email)).workspaceId;
const currencyRows = async (code: string) =>
  (
    await w.db
      .prepare('SELECT code, kind, decimals FROM currencies WHERE code = ?')
      .bind(code)
      .all()
  ).results;

describe('accounts in any currency', () => {
  it('adds a currencies row the first time an account uses a code, and the Main pocket follows', async () => {
    const ws = await ensure('jpy@test');
    const yen = await svc(ws).accounts.create({
      name: 'Yen cash',
      kind: 'CASH',
      currency: 'JPY',
      openingBalance: 1500,
    });
    expect(await currencyRows('JPY')).toEqual([{ code: 'JPY', kind: 'FIAT', decimals: 0 }]);
    expect(yen.currency_code).toBe('JPY');
    expect(
      (await w.repos.envelopes.list(ws)).find(e => e.id === `${yen.id}:main`)!.currency_code,
    ).toBe('JPY');
  });

  it('does not duplicate the row or fail for a second account in the same code', async () => {
    const ws = await ensure('jpy2@test');
    await svc(ws).accounts.create({ name: 'Suica', kind: 'EWALLET', currency: 'JPY' });
    await svc(ws).accounts.create({ name: 'Yen', kind: 'CASH', currency: 'JPY' });
    expect(await currencyRows('JPY')).toHaveLength(1);
  });

  it('switches an empty account to a new code (Main follows) and locks it once it has entries', async () => {
    const ws = await ensure('kwd@test');
    const a = await svc(ws).accounts.create({ name: 'Wallet', kind: 'CASH', currency: 'JPY' });
    await svc(ws).accounts.update(a.id, { currency_code: 'KWD' });
    expect(await currencyRows('KWD')).toEqual([{ code: 'KWD', kind: 'FIAT', decimals: 3 }]);
    expect(
      (await w.repos.envelopes.list(ws)).find(e => e.id === `${a.id}:main`)!.currency_code,
    ).toBe('KWD');
    await svc(ws).accounts.reconcile(a.id, { actual: 1250 });
    await expect(svc(ws).accounts.update(a.id, { currency_code: 'JPY' })).rejects.toMatchObject({
      code: 'CURRENCY_LOCKED',
    });
  });

  it('adds the row for a foreign amount paid from a rupiah account', async () => {
    const ws = await ensure('eur@test');
    const bca = await svc(ws).accounts.create({
      name: 'BCA',
      kind: 'BANK',
      openingBalance: 1_000_000,
    });
    const food = (await w.repos.categories.list(ws)).find(c => c.name === 'Food & Drink')!.id;
    await svc(ws).ledger.record([
      {
        type: 'EXPENSE',
        accountId: bca.id,
        categoryId: food,
        amount: 270_000,
        date: '2026-11-10',
        originalAmount: 1500,
        originalCurrency: 'EUR',
      },
    ]);
    expect(await currencyRows('EUR')).toHaveLength(1);
  });

  it('reports each balance in its own currency, never summed', async () => {
    const ws = await ensure('mixed@test');
    const bca = await svc(ws).accounts.create({
      name: 'BCA',
      kind: 'BANK',
      openingBalance: 2_000_000,
    });
    const yen = await svc(ws).accounts.create({
      name: 'Yen',
      kind: 'CASH',
      currency: 'JPY',
      openingBalance: 1500,
    });
    const b = await svc(ws).ledger.balances();
    expect(b.accounts.find(a => a.id === bca.id)).toMatchObject({
      currency_code: 'IDR',
      balance: 2_000_000,
    });
    expect(b.accounts.find(a => a.id === yen.id)).toMatchObject({
      currency_code: 'JPY',
      balance: 1500,
    });
    expect(Object.keys(b).sort()).toEqual(['accounts', 'envelopes']);
  });
});

describe('old names of an account', () => {
  it('saves the old name with its time on a rename and lists them newest first in the catalog', async () => {
    const ws = await ensure('rename@test');
    const a = await svc(ws).accounts.create({ name: 'Abang', kind: 'IOU' });
    await svc(ws).accounts.update(a.id, { name: 'Obang' });
    await svc(ws).accounts.update(a.id, { name: 'Obang' }); // same name: no row
    await svc(ws).accounts.update(a.id, { name: 'Bang O' });
    const acc = (await svc(ws).workspace.catalog()).accounts.find(x => x.id === a.id)!;
    expect(acc.name).toBe('Bang O');
    expect(acc.formerNames).toEqual([
      { name: 'Obang', at: new Date(NOW).toISOString() },
      { name: 'Abang', at: new Date(NOW).toISOString() },
    ]);
  });

  it('keeps other workspaces and unrenamed accounts empty', async () => {
    const ws = await ensure('rename2@test');
    const a = await svc(ws).accounts.create({ name: 'Solo', kind: 'IOU' });
    const other = await ensure('rename3@test');
    expect((await svc(other).workspace.catalog()).accounts.every(x => !x.formerNames.length)).toBe(
      true,
    );
    expect(
      (await svc(ws).workspace.catalog()).accounts.find(x => x.id === a.id)!.formerNames,
    ).toEqual([]);
  });

  it('does not save a name when the rename fails on a duplicate', async () => {
    const ws = await ensure('rename4@test');
    await svc(ws).accounts.create({ name: 'Taken', kind: 'IOU' });
    const b = await svc(ws).accounts.create({ name: 'Free', kind: 'IOU' });
    await expect(svc(ws).accounts.update(b.id, { name: 'Taken' })).rejects.toThrow();
    expect(
      (await svc(ws).workspace.catalog()).accounts.find(x => x.id === b.id)!.formerNames,
    ).toEqual([]);
  });
});
