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

  it('refuses a card or pay later without its limit, closing day and pay-by day', async () => {
    const ws = await ensure('nolimit@test');
    for (const missing of ['creditLimit', 'statementDay', 'dueDay'] as const) {
      const i = { name: 'Kartu', kind: 'CREDIT_CARD', creditLimit: 1, statementDay: 20, dueDay: 5 };
      await expect(svc(ws).accounts.create({ ...i, [missing]: null })).rejects.toMatchObject({
        code: 'CARD_SETUP',
      });
    }
  });

  it('saves a new pay later account with its limit, so nothing reads as owed', async () => {
    const ws = await ensure('limit@test');
    const pl = await svc(ws).accounts.create({
      name: 'SPayLater',
      kind: 'PAYLATER',
      creditLimit: 21_000_000,
      statementDay: 31,
      dueDay: 5,
    });
    expect(pl).toMatchObject({ credit_limit: 21_000_000, statement_day: 31, due_day: 5 });
    expect((await w.repos.accounts.list(ws)).find(a => a.id === pl.id)!.credit_limit).toBe(
      21_000_000,
    );
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

describe('a card opening: what is used, split between the last bill and since', () => {
  // Today is 10 Nov: a card closing on the 5th, pay by the 25th, last closed 5 Nov (due 25 Nov).
  const card = { kind: 'CREDIT_CARD', creditLimit: 12_000_000, statementDay: 5, dueDay: 25 };

  it('puts the unpaid part on the last bill and the rest on the next', async () => {
    const ws = await ensure('opening-split@test');
    const a = await svc(ws).accounts.create({
      name: 'BCA Card',
      ...card,
      openingBalance: -1_600_000,
      billedBalance: 1_000_000,
    });
    const bill = (await svc(ws).recurring.list()).cards.find(x => x.accountId === a.id);
    expect(bill).toMatchObject({
      cutOff: '2026-11-05',
      dueOn: '2026-11-25',
      bill: 1_000_000,
      left: 1_000_000,
      spentSince: 600_000,
    });
    expect((await svc(ws).ledger.balances()).accounts.find(x => x.id === a.id)?.balance).toBe(
      -1_600_000,
    );
  });

  it('does the same for a first-run opening (reconcile), and refuses a bill above what is used', async () => {
    const ws = await ensure('opening-reconcile@test');
    const a = await svc(ws).accounts.create({ name: 'Kredivo', ...card, kind: 'PAYLATER' });
    await expect(
      svc(ws).accounts.reconcile(a.id, { actual: -500_000, billed: 600_000 }),
    ).rejects.toMatchObject({ code: 'BILLED_TOO_MUCH' });
    await svc(ws).accounts.reconcile(a.id, { actual: -500_000, billed: 500_000 });
    const bill = (await svc(ws).recurring.list()).cards.find(x => x.accountId === a.id);
    expect(bill).toMatchObject({ bill: 500_000, left: 500_000, spentSince: 0 });
  });

  it('has no pockets', async () => {
    const ws = await ensure('card-pockets@test');
    const a = await svc(ws).accounts.create({ name: 'BCA Card', ...card });
    await expect(
      svc(ws).pockets.create({ accountId: a.id, name: 'Trip', kind: 'SAVINGS' }),
    ).rejects.toMatchObject({ code: 'CARD_POCKETS' });
  });

  it('an edit keeps a card set up: no card without its limit and days', async () => {
    const ws = await ensure('card-edit@test');
    const a = await svc(ws).accounts.create({ name: 'BCA Card', ...card });
    await expect(svc(ws).accounts.update(a.id, { statement_day: null })).rejects.toMatchObject({
      code: 'CARD_SETUP',
    });
    const bank = await svc(ws).accounts.create({ name: 'Jago', kind: 'BANK' });
    await expect(
      svc(ws).accounts.update(bank.id, { kind: 'PAYLATER', credit_limit: 1_000_000 }),
    ).rejects.toMatchObject({ code: 'CARD_SETUP' });
    await svc(ws).accounts.update(bank.id, {
      kind: 'PAYLATER',
      credit_limit: 1_000_000,
      statement_day: 20,
      due_day: 5,
    });
    // A card from before slice 1 (no days) can still be renamed or hidden.
    await w.db.prepare('UPDATE accounts SET statement_day = NULL WHERE id = ?').bind(a.id).run();
    await svc(ws).accounts.update(a.id, { name: 'Old BCA', archived: true });
  });

  it('bank ⇄ card only while the account has no entries and no pockets', async () => {
    const ws = await ensure('card-kind@test');
    const days = { credit_limit: 5_000_000, statement_day: 20, due_day: 5 };
    const used = await svc(ws).accounts.create({
      name: 'BCA',
      kind: 'BANK',
      openingBalance: 5_000,
    });
    await expect(
      svc(ws).accounts.update(used.id, { kind: 'CREDIT_CARD', ...days }),
    ).rejects.toMatchObject({ code: 'CARD_KIND_LOCKED' });
    const pocketed = await svc(ws).accounts.create({ name: 'Jago', kind: 'BANK' });
    await svc(ws).pockets.create({ accountId: pocketed.id, name: 'Rent', kind: 'SPENDING' });
    await expect(
      svc(ws).accounts.update(pocketed.id, { kind: 'CREDIT_CARD', ...days }),
    ).rejects.toMatchObject({ code: 'CARD_KIND_LOCKED' });
    const owed = await svc(ws).accounts.create({ name: 'Kredivo', ...card, kind: 'PAYLATER' });
    await svc(ws).accounts.reconcile(owed.id, { actual: -100_000 });
    await expect(svc(ws).accounts.update(owed.id, { kind: 'BANK' })).rejects.toMatchObject({
      code: 'CARD_KIND_LOCKED',
    });
    // Within the same side, and on an empty account, the type still changes.
    await svc(ws).accounts.update(used.id, { kind: 'EWALLET' });
    const empty = await svc(ws).accounts.create({ name: 'Blu', kind: 'BANK' });
    await svc(ws).accounts.update(empty.id, { kind: 'CREDIT_CARD', ...days });
  });
});
