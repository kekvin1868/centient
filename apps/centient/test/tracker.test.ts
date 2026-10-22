// Integration test: use cases and D1 repositories against SQLite with the real migrations.
import { beforeAll, describe, expect, it } from 'vitest';
import * as uc from '../src/application/usecases';
import { D1Catalog, D1Ledger, D1Prices } from '../src/infrastructure/d1';
import { migrationsSql, testD1 } from './d1shim';

let deps: uc.Deps;
// Saturday 17 Oct 2026, 10:00 in Jakarta.
const NOW = Date.parse('2026-10-17T03:00:00Z');

beforeAll(() => {
  const db = testD1(migrationsSql());
  deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), now: () => NOW };
});

async function setup(email: string) {
  const { workspaceId: ws } = await deps.catalog.ensureWorkspace(email);
  const categories = await deps.catalog.listCategories(ws);
  const cat = (n: string) => categories.find(c => c.name === n)!.id;
  const bca = await uc.createAccount(deps, ws, { name: 'BCA', kind: 'BANK', provider: 'bca', openingBalance: 10_000_000 });
  const gopay = await uc.createAccount(deps, ws, { name: 'GoPay', kind: 'EWALLET', provider: 'gopay' });
  const friends = await uc.createAccount(deps, ws, { name: 'Friends', kind: 'IOU' });
  return { ws, cat, bca: bca.id, gopay: gopay.id, friends: friends.id, main: (account: string) => `${account}:main` };
}

/** Every account's balance equals the sum of its pockets. */
async function pocketsAddUp(ws: string) {
  const b = await uc.getBalances(deps, ws);
  for (const a of b.accounts) expect(b.envelopes.filter(e => e.account_id === a.id).reduce((s, e) => s + e.balance, 0)).toBe(a.balance);
}

const sum = (xs: { balance: number }[]) => xs.reduce((s, x) => s + x.balance, 0);

describe('tracker', () => {
  it('records expenses, transfers with fees and split bills, and stays balanced', async () => {
    const t = await setup('a@test');
    await uc.recordTransactions(deps, t.ws, [
      { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 100_000, date: '2026-10-17', merchant: 'Pizza Hut', split: { people: 3, iouAccountId: t.friends } },
      { type: 'TRANSFER', fromAccountId: t.bca, toAccountId: t.gopay, amount: 500_000, fee: 2_500, date: '2026-10-17' },
      { type: 'EXPENSE', accountId: t.gopay, categoryId: t.cat('Food & Drink'), amount: 25_000, date: '2026-10-16' },
    ]);
    const b = await uc.getBalances(deps, t.ws);
    const bal = (id: string) => b.accounts.find(a => a.id === id)!.balance;
    expect(bal(t.bca)).toBe(10_000_000 - 100_000 - 500_000 - 2_500);
    expect(bal(t.gopay)).toBe(475_000);
    expect(bal(t.friends)).toBe(66_666); // they owe me; my share was 33,334
    expect(sum(b.accounts)).toBe(sum(b.envelopes)); // the ledger invariant
    await pocketsAddUp(t.ws); // and per account: money moves with the pockets (transfers too)
    expect(b.envelopes.find(e => e.id === t.main(t.friends))!.balance).toBe(66_666);
  });

  it('keeps workspaces apart', async () => {
    const a = await setup('owner-a@test');
    const b = await setup('owner-b@test');
    await uc.recordTransactions(deps, a.ws, [{ type: 'EXPENSE', accountId: a.bca, categoryId: a.cat('Food & Drink'), amount: 30_000, date: '2026-10-17' }]);
    // B cannot spend from A's account, nor read or delete A's transactions.
    await expect(uc.recordTransactions(deps, b.ws, [{ type: 'EXPENSE', accountId: a.bca, categoryId: b.cat('Food & Drink'), amount: 1, date: '2026-10-17' }]))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const aList = await uc.listEntries(deps, a.ws, { limit: 50 });
    const bList = await uc.listEntries(deps, b.ws, { limit: 50 });
    expect(bList.items.some(x => aList.items.some(y => y.id === x.id))).toBe(false);
    await expect(uc.deleteEntry(deps, b.ws, aList.items[0].id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(uc.editEntry(deps, b.ws, aList.items[0].id, { type: 'EXPENSE', accountId: b.bca, categoryId: b.cat('Food & Drink'), amount: 1, date: '2026-10-17' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(uc.updateBalance(deps, b.ws, a.bca, { actual: 0 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(uc.updateItem(deps, b.ws, 'accounts', a.bca, { name: 'stolen' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reports budget status with a safe amount per day', async () => {
    const t = await setup('budget@test');
    await uc.setBudget(deps, t.ws, { categoryId: t.cat('Food & Drink'), limit: 1_500_000 });
    await uc.recordTransactions(deps, t.ws, [
      { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 250_000, date: '2026-10-05' },
      { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 99_000, date: '2026-09-30' }, // previous cycle
    ]);
    const s = await uc.getBudgetStatus(deps, t.ws);
    expect(s.cycle).toEqual({ from: '2026-10-01', to: '2026-11-01', daysLeft: 15 });
    expect(s.budgets[0]).toMatchObject({ limit: 1_500_000, spent: 250_000, remaining: 1_250_000, percent: 17, safePerDay: 83_333 });
  });

  it('parses quick add with history and learns corrected merchants', async () => {
    const t = await setup('quick@test');
    const [draft] = await uc.quickParse(deps, t.ws, 'mkn ph 100 bg 3');
    expect(draft).toMatchObject({ amount: 100_000, needsConfirm: true, merchant: 'Pizza Hut', split: 3, accountId: t.bca });
    await uc.quickSave(deps, t.ws, [{
      command: { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 85_000, date: '2026-10-17', merchant: 'Warkop Bang Ali' },
      rawMerchant: 'warkop', suggestedMerchant: 'Warkop',
    }]);
    const [next] = await uc.quickParse(deps, t.ws, 'warkop 90');
    expect(next).toMatchObject({ merchant: 'Warkop Bang Ali', categoryId: t.cat('Food & Drink'), amount: 90_000 });
  });

  it('soft-deletes and exports', async () => {
    const t = await setup('csv@test');
    const [id] = await uc.recordTransactions(deps, t.ws, [{ type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 20_000, date: '2026-10-17', merchant: 'Kopi, "Tuku"' }]);
    expect(await uc.exportCsv(deps, t.ws)).toContain('"kopi, ""tuku"""');
    await uc.deleteEntry(deps, t.ws, id);
    const b = await uc.getBalances(deps, t.ws);
    expect(b.accounts.find(a => a.id === t.bca)!.balance).toBe(10_000_000);
  });

  it('keeps a split bill as one entry, and editing rebuilds or collapses it', async () => {
    const t = await setup('edit@test');
    const split = { type: 'EXPENSE' as const, accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 90_000, date: '2026-10-16', merchant: 'Pizza Hut', split: { people: 3, iouAccountId: t.friends } };
    const [id] = await uc.recordTransactions(deps, t.ws, [split]);
    const before = await deps.ledger.getEntry(t.ws, id);
    expect(before?.transactions.map(x => x.type)).toEqual(['EXPENSE', 'TRANSFER']);

    await uc.editEntry(deps, t.ws, id, { ...split, amount: 120_000 });
    let b = await uc.getBalances(deps, t.ws);
    const bal = (acc: string) => b.accounts.find(a => a.id === acc)!.balance;
    expect(bal(t.bca)).toBe(10_000_000 - 120_000);
    expect(bal(t.friends)).toBe(80_000);
    expect(sum(b.accounts)).toBe(sum(b.envelopes));
    const edited = await deps.ledger.getEntry(t.ws, id);
    expect(edited?.occurred_at).toBe(before?.occurred_at); // same day keeps its time

    const { split: _, ...alone } = split;
    await uc.editEntry(deps, t.ws, id, { ...alone, amount: 50_000 });
    b = await uc.getBalances(deps, t.ws);
    expect((await deps.ledger.getEntry(t.ws, id))?.transactions).toHaveLength(1);
    expect(bal(t.bca)).toBe(10_000_000 - 50_000);
    expect(bal(t.friends)).toBe(0);

    await expect(uc.editEntry(deps, t.ws, id, { type: 'INCOME', accountId: t.bca, categoryId: t.cat('Salary'), amount: 1, date: '2026-10-16' }))
      .rejects.toMatchObject({ code: 'TYPE_LOCKED' });
  });

  it('keeps a transfer fee with its transfer, and deleting the entry removes both', async () => {
    const t = await setup('fee@test');
    const [id] = await uc.recordTransactions(deps, t.ws, [{ type: 'TRANSFER', fromAccountId: t.bca, toAccountId: t.gopay, amount: 100_000, fee: 2_500, date: '2026-10-17' }]);
    const { items } = await uc.listEntries(deps, t.ws, { limit: 50 });
    const entry = items.find(e => e.id === id)!;
    expect(entry.transactions).toHaveLength(2);
    expect(entry.command).toMatchObject({ type: 'TRANSFER', fee: 2_500 });
    await uc.deleteEntry(deps, t.ws, id);
    const b = await uc.getBalances(deps, t.ws);
    expect(b.accounts.find(a => a.id === t.bca)!.balance).toBe(10_000_000);
    expect((await uc.listEntries(deps, t.ws, { limit: 50 })).items.some(e => e.id === id)).toBe(false);
    await expect(uc.deleteEntry(deps, t.ws, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('pages entries by date with a cursor and filters by account', async () => {
    const t = await setup('page@test');
    await uc.recordTransactions(deps, t.ws, ['2026-10-10', '2026-10-11', '2026-10-12'].map(date =>
      ({ type: 'EXPENSE' as const, accountId: t.gopay, categoryId: t.cat('Food & Drink'), amount: 10_000, date })));
    const first = await uc.listEntries(deps, t.ws, { limit: 2, accountId: t.gopay });
    expect(first.items.map(e => e.occurred_at.slice(0, 10))).toEqual(['2026-10-12', '2026-10-11']);
    const second = await uc.listEntries(deps, t.ws, { limit: 2, accountId: t.gopay, cursor: first.nextCursor! });
    expect(second.items.map(e => e.occurred_at.slice(0, 10))).toEqual(['2026-10-10']);
    expect(second.nextCursor).toBeNull();
  });

  it('updates a balance: categorised gaps count toward budgets, skipped ones do not', async () => {
    const t = await setup('balance@test');
    await uc.setBudget(deps, t.ws, { categoryId: t.cat('Food & Drink'), limit: 1_000_000 });
    const spentFood = async () => (await uc.getBudgetStatus(deps, t.ws)).budgets[0].spent;
    const balance = async () => (await uc.getBalances(deps, t.ws)).accounts.find(a => a.id === t.bca)!.balance;

    expect(await uc.updateBalance(deps, t.ws, t.bca, { actual: 9_950_000, categoryId: t.cat('Food & Drink') })).toMatchObject({ balance: 9_950_000 });
    expect(await balance()).toBe(9_950_000);
    expect(await spentFood()).toBe(50_000);

    await uc.updateBalance(deps, t.ws, t.bca, { actual: 9_900_000 });
    expect(await balance()).toBe(9_900_000);
    expect(await spentFood()).toBe(50_000);

    await uc.updateBalance(deps, t.ws, t.bca, { actual: 9_920_000, categoryId: t.cat('Interest & cashback') });
    expect(await balance()).toBe(9_920_000);

    await uc.updateBalance(deps, t.ws, t.bca, { actual: 9_920_000 }); // no gap: nothing recorded
    const corrections = (await uc.listEntries(deps, t.ws, { limit: 50 })).items.filter(e => e.kind === 'CORRECTION');
    expect(corrections).toHaveLength(3);
    expect(corrections.every(e => e.command === null)).toBe(true);
    expect((await deps.catalog.listAccounts(t.ws)).find(a => a.id === t.bca)!.reconciled_at).toBe(new Date(NOW).toISOString());

    await expect(uc.updateBalance(deps, t.ws, t.bca, { actual: 1, categoryId: t.cat('Salary') })).rejects.toMatchObject({ code: 'WRONG_CATEGORY_KIND' });
    await expect(uc.editEntry(deps, t.ws, corrections[0].id, { type: 'INCOME', accountId: t.bca, categoryId: t.cat('Salary'), amount: 1, date: '2026-10-17' }))
      .rejects.toMatchObject({ code: 'NOT_EDITABLE' });
    const b = await uc.getBalances(deps, t.ws);
    expect(sum(b.accounts)).toBe(sum(b.envelopes));
  });

  it('lets an account change currency only while it has no entries', async () => {
    const t = await setup('currency@test');
    const wise = await uc.createAccount(deps, t.ws, { name: 'Wise', kind: 'BANK' });
    await uc.updateItem(deps, t.ws, 'accounts', wise.id, { currency_code: 'USD' });
    expect((await deps.catalog.listAccounts(t.ws)).find(a => a.id === wise.id)).toMatchObject({ currency_code: 'USD', default_envelope_id: `${wise.id}:main` });
    expect((await deps.catalog.listEnvelopes(t.ws)).find(e => e.id === `${wise.id}:main`)!.currency_code).toBe('USD');
    await expect(uc.updateItem(deps, t.ws, 'accounts', t.bca, { currency_code: 'USD' })).rejects.toMatchObject({ code: 'CURRENCY_LOCKED' });
  });
});

describe('deleting and resetting', () => {
  it('deletes an account with every entry that touches it, keeping the ledger balanced', async () => {
    const t = await setup('delete@test');
    await uc.recordTransactions(deps, t.ws, [
      { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 90_000, date: '2026-10-17', split: { people: 3, iouAccountId: t.friends } },
      { type: 'EXPENSE', accountId: t.gopay, categoryId: t.cat('Food & Drink'), amount: 20_000, date: '2026-10-17' },
    ]);
    await uc.deleteAccount(deps, t.ws, t.bca);
    expect((await deps.catalog.listAccounts(t.ws)).some(a => a.id === t.bca)).toBe(false);
    const b = await uc.getBalances(deps, t.ws);
    expect(b.accounts.find(a => a.id === t.friends)!.balance).toBe(0); // the split's IOU half went too
    expect(b.accounts.find(a => a.id === t.gopay)!.balance).toBe(-20_000);
    expect(sum(b.accounts)).toBe(sum(b.envelopes));
    expect((await uc.listEntries(deps, t.ws, { limit: 50 })).items).toHaveLength(1);
    await expect(uc.deleteAccount(deps, t.ws, t.bca)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // The name is free again for a new account.
    await uc.createAccount(deps, t.ws, { name: 'BCA', kind: 'BANK' });
  });

  it('lets an account change type, but not into or out of "Friends owe you"', async () => {
    const t = await setup('kind@test');
    await uc.updateItem(deps, t.ws, 'accounts', t.gopay, { kind: 'CASH' });
    expect((await deps.catalog.listAccounts(t.ws)).find(a => a.id === t.gopay)!.kind).toBe('CASH');
    await expect(uc.updateItem(deps, t.ws, 'accounts', t.friends, { kind: 'BANK' })).rejects.toMatchObject({ code: 'KIND_LOCKED' });
  });

  it('backs up everything, then a reset starts a fresh workspace and keeps the old one flagged', async () => {
    const t = await setup('reset@test');
    await uc.recordTransactions(deps, t.ws, [{ type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 30_000, date: '2026-10-17' }]);
    const b = await uc.backup(deps, t.ws);
    expect(b).toMatchObject({ format: 'centient-backup', version: 1, workspace: { id: t.ws } });
    expect(b.accounts.map(a => a.name)).toEqual(expect.arrayContaining(['BCA', 'GoPay', 'Friends']));
    expect(b.entries.map(e => e.kind).sort()).toEqual(['OPENING', 'USER']);

    await uc.resetWorkspace(deps, t.ws);
    const { workspaceId: fresh } = await deps.catalog.ensureWorkspace('reset@test');
    expect(fresh).not.toBe(t.ws);
    expect((await deps.catalog.listAccounts(fresh)).map(a => [a.name, a.kind])).toEqual([['Dailies', 'EWALLET'], ['Main Account', 'BANK'], ['Miscs', 'DEBIT_CARD']]);
    expect((await uc.listEntries(deps, fresh, { limit: 50 })).items).toHaveLength(0);
    // Soft delete: the old workspace and its data are still there.
    expect((await uc.listEntries(deps, t.ws, { limit: 50 })).items).toHaveLength(2);
  });
});

describe('migration 0002', () => {
  it('turns existing transactions into editable entries', async () => {
    const [init, groups] = migrationsSql().split('-- Entry groups:');
    const seed = `
      INSERT INTO workspaces (id, name) VALUES ('w', 'Old');
      INSERT INTO accounts (id, workspace_id, name, kind) VALUES ('acc', 'w', 'BCA', 'BANK');
      INSERT INTO envelopes (id, workspace_id, name) VALUES ('env', 'w', 'Monthly');
      INSERT INTO categories (id, workspace_id, name, kind) VALUES ('food', 'w', 'Food', 'EXPENSE'), ('adj', 'w', 'Balance adjustment', 'EXPENSE');
      INSERT INTO transactions (id, workspace_id, type, occurred_at, category_id, merchant) VALUES ('t1', 'w', 'EXPENSE', '2026-10-01T09:00:00+07:00', 'food', 'warteg');
      INSERT INTO entries VALUES ('t1', 'acc', -20000);
      INSERT INTO allocations VALUES ('t1', 'env', -20000);
    `;
    const db = testD1(`${init}\n${seed}\n-- Entry groups:${groups}`);
    const old: uc.Deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), now: () => NOW };
    const [entry] = (await uc.listEntries(old, 'w', { limit: 10 })).items;
    // 0007 moved the money into the account's own Main pocket.
    expect(entry).toMatchObject({ id: 't1', kind: 'USER', command: { type: 'EXPENSE', accountId: 'acc', envelopeId: 'acc:main', amount: 20000, date: '2026-10-01' } });
    await uc.editEntry(old, 'w', 't1', { ...(entry.command as uc.Command & { type: 'EXPENSE' }), amount: 25000 });
    expect((await uc.getBalances(old, 'w')).accounts[0].balance).toBe(-25000);
    expect((await old.catalog.listCategories('w')).find(c => c.id === 'adj')!.kind).toBe('INCOME');
  });
});

describe('migration 0004', () => {
  it('folds the old fifteen spending categories into the ten broad ones, with everything that pointed at them', async () => {
    const [before, merge] = migrationsSql().split('-- Merge legacy categories:');
    const seed = `
      INSERT INTO workspaces (id, name) VALUES ('w', 'Old');
      INSERT INTO accounts (id, workspace_id, name, kind) VALUES ('acc', 'w', 'BCA', 'BANK');
      INSERT INTO envelopes (id, workspace_id, name) VALUES ('env', 'w', 'Monthly');
      INSERT INTO categories (id, workspace_id, name, kind) VALUES ('food', 'w', 'Food & Drink', 'EXPENSE'), ('coffee', 'w', 'Coffee', 'EXPENSE'),
        ('groc', 'w', 'Groceries', 'EXPENSE'), ('house', 'w', 'Housing', 'EXPENSE'), ('snacks', 'w', 'Snacks', 'EXPENSE');
      INSERT INTO entry_groups (id, workspace_id, kind, command) VALUES ('g1', 'w', 'USER',
        '{"type":"EXPENSE","accountId":"acc","envelopeId":"env","categoryId":"coffee","amount":25000,"date":"2026-10-01"}');
      INSERT INTO transactions (id, workspace_id, group_id, type, occurred_at, category_id) VALUES ('t1', 'w', 'g1', 'EXPENSE', '2026-10-01T09:00:00+07:00', 'coffee');
      INSERT INTO entries VALUES ('t1', 'acc', -25000);
      INSERT INTO allocations VALUES ('t1', 'env', -25000);
      INSERT INTO budgets (id, workspace_id, category_id, envelope_id) VALUES ('b1', 'w', 'coffee', NULL), ('b2', 'w', 'groc', NULL);
      INSERT INTO budget_limits VALUES ('b1', '2026-10-01', 100000), ('b2', '2026-10-01', 200000);
      INSERT INTO aliases VALUES ('w', 'kopi', 'CATEGORY', 'coffee');
    `;
    const db = testD1(`${before}\n${seed}\n-- Merge legacy categories:${merge}`);
    const old: uc.Deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), now: () => NOW };
    const cats = await old.catalog.listCategories('w');
    const live = cats.filter(c => !c.archived_at).map(c => c.name).sort();
    expect(live).toEqual(['Food & Drink', 'Home & Bills', 'Snacks']);
    expect(cats.filter(c => c.archived_at).map(c => c.name).sort()).toEqual(['Coffee', 'Groceries', 'Housing']);
    const [entry] = (await uc.listEntries(old, 'w', { limit: 10 })).items;
    expect(entry.transactions[0].category_id).toBe('food');
    expect(entry.command).toMatchObject({ categoryId: 'food' });
    const budgets = await old.catalog.listBudgets('w');
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({ category_id: 'food', limits: [{ effective_from: '2026-10-01', amount: 300000 }] });
    expect(await old.catalog.listAliases('w')).toEqual([{ alias: 'kopi', kind: 'CATEGORY', value: 'food' }]);
    // The moved entry still edits: its saved command points at a live category.
    await uc.editEntry(old, 'w', 'g1', { ...(entry.command as uc.Command & { type: 'EXPENSE' }), amount: 30000 });
    expect((await uc.getBalances(old, 'w')).accounts[0].balance).toBe(-30000);
  });
});

describe('crypto prices', () => {
  it('prices held crypto in rupiah, caches for 10 minutes, and serves the last price when the service is down', async () => {
    const db = testD1(migrationsSql());
    let clock = NOW;
    let calls = 0;
    let up = true;
    const fakeFetch = (async (url: string) => {
      calls++;
      if (!up) throw new Error('offline');
      expect(url).toContain('ids=bitcoin');
      return new Response(JSON.stringify({ bitcoin: { idr: 1_650_000_000.4 } }));
    }) as unknown as typeof fetch;
    const p: uc.Deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), prices: new D1Prices(db), fetch: fakeFetch, now: () => clock };
    const { workspaceId: ws } = await p.catalog.ensureWorkspace('crypto@test');
    expect(await uc.getPrices(p, ws)).toEqual({}); // no crypto account, no call
    expect(calls).toBe(0);
    await uc.createAccount(p, ws, { name: 'TokoCrypto', kind: 'EXCHANGE', currency: 'BTC' });
    expect(await uc.getPrices(p, ws)).toEqual({ BTC: { idrPerUnit: 1_650_000_000, fetchedAt: new Date(NOW).toISOString() } });
    clock = NOW + 5 * 60_000;
    await uc.getPrices(p, ws);
    expect(calls).toBe(1); // still fresh
    clock = NOW + 30 * 60_000;
    up = false;
    expect((await uc.getPrices(p, ws)).BTC).toEqual({ idrPerUnit: 1_650_000_000, fetchedAt: new Date(NOW).toISOString() });
    expect(calls).toBe(2);
  });
});

describe('pockets inside accounts', () => {
  it('starts a workspace with three everyday accounts, each with a Main pocket, and no IOU', async () => {
    const { workspaceId: ws } = await deps.catalog.ensureWorkspace('seed@test');
    const accounts = await deps.catalog.listAccounts(ws);
    expect(accounts.map(a => [a.name, a.kind])).toEqual([['Dailies', 'EWALLET'], ['Main Account', 'BANK'], ['Miscs', 'DEBIT_CARD']]);
    const pockets = await deps.catalog.listEnvelopes(ws);
    expect(pockets.map(e => [accounts.find(a => a.id === e.account_id)!.name, e.name]).sort()).toEqual([['Dailies', 'Main'], ['Main Account', 'Main'], ['Miscs', 'Main']]);
    expect(accounts.every(a => pockets.some(e => e.id === a.default_envelope_id))).toBe(true);
    expect((await deps.catalog.getWorkspace(ws)).onboarded_at).toBeNull();
  });

  it("keeps an account's balance as the sum of its pockets, and moves money only within one account", async () => {
    const t = await setup('pockets@test');
    const rent = await uc.createPocket(deps, t.ws, { accountId: t.bca, name: 'Rent', kind: 'SAVINGS' });
    const holiday = await uc.createPocket(deps, t.ws, { accountId: t.gopay, name: 'Rent', kind: 'SPENDING' }); // same name, other account: fine
    await uc.recordTransactions(deps, t.ws, [
      { type: 'ALLOCATE', fromEnvelopeId: t.main(t.bca), toEnvelopeId: rent.id, amount: 3_000_000, date: '2026-10-17' },
      { type: 'EXPENSE', accountId: t.bca, envelopeId: rent.id, categoryId: t.cat('Home & Bills'), amount: 2_500_000, date: '2026-10-17' },
      { type: 'TRANSFER', fromAccountId: t.bca, toAccountId: t.gopay, toEnvelopeId: holiday.id, amount: 100_000, date: '2026-10-17' },
    ]);
    const b = await uc.getBalances(deps, t.ws);
    const pocket = (id: string) => b.envelopes.find(e => e.id === id)!.balance;
    expect(pocket(rent.id)).toBe(500_000);
    expect(pocket(t.main(t.bca))).toBe(10_000_000 - 3_000_000 - 100_000);
    expect(pocket(holiday.id)).toBe(100_000);
    await pocketsAddUp(t.ws);
    await expect(uc.recordTransactions(deps, t.ws, [{ type: 'ALLOCATE', fromEnvelopeId: rent.id, toEnvelopeId: holiday.id, amount: 1, date: '2026-10-17' }]))
      .rejects.toMatchObject({ code: 'POCKET_ACCOUNT' });
    await expect(uc.recordTransactions(deps, t.ws, [{ type: 'EXPENSE', accountId: t.gopay, envelopeId: rent.id, categoryId: t.cat('Food & Drink'), amount: 1, date: '2026-10-17' }]))
      .rejects.toMatchObject({ code: 'POCKET_ACCOUNT' });
    await expect(uc.updateItem(deps, t.ws, 'envelopes', rent.id, { archived: true })).rejects.toMatchObject({ code: 'POCKET_NOT_EMPTY' });
    await expect(uc.updateItem(deps, t.ws, 'envelopes', t.main(t.bca), { archived: true })).rejects.toMatchObject({ code: 'MAIN_POCKET' });
    await expect(uc.createPocket(deps, t.ws, { accountId: t.friends, name: 'X', kind: 'SPENDING' })).rejects.toMatchObject({ code: 'IOU_POCKETS' });
  });

  it('creates "Friends" on the first split bill, and sets a first balance as the opening balance', async () => {
    const { workspaceId: ws } = await deps.catalog.ensureWorkspace('split@test');
    const accounts = await deps.catalog.listAccounts(ws);
    const main = accounts.find(a => a.name === 'Main Account')!;
    await uc.updateBalance(deps, ws, main.id, { actual: 2_000_000 });
    const food = (await deps.catalog.listCategories(ws)).find(c => c.name === 'Food & Drink')!.id;
    await uc.recordTransactions(deps, ws, [{ type: 'EXPENSE', accountId: main.id, categoryId: food, amount: 90_000, date: '2026-10-17', split: { people: 3 } }]);
    const friends = (await deps.catalog.listAccounts(ws)).find(a => a.kind === 'IOU')!;
    expect(friends.name).toBe('Friends');
    const b = await uc.getBalances(deps, ws);
    expect(b.accounts.find(a => a.id === friends.id)!.balance).toBe(60_000);
    const kinds = (await uc.listEntries(deps, ws, { limit: 10 })).items.map(e => e.kind).sort();
    expect(kinds).toEqual(['OPENING', 'USER']);
  });

  it('switches an account to and from Debit card', async () => {
    const t = await setup('debit@test');
    await uc.updateItem(deps, t.ws, 'accounts', t.bca, { kind: 'DEBIT_CARD' });
    expect((await deps.catalog.listAccounts(t.ws)).find(a => a.id === t.bca)!.kind).toBe('DEBIT_CARD');
    await uc.updateItem(deps, t.ws, 'accounts', t.bca, { kind: 'BANK' });
    expect((await deps.catalog.listAccounts(t.ws)).find(a => a.id === t.bca)!.kind).toBe('BANK');
  });
});

describe('deleting a category', () => {
  it('moves its entries, budget and quick-add words to another category, then frees its name', async () => {
    const t = await setup('delcat@test');
    const snacks = await deps.catalog.createCategory(t.ws, { name: 'Snacks', kind: 'EXPENSE' });
    const [id] = await uc.recordTransactions(deps, t.ws, [{ type: 'EXPENSE', accountId: t.bca, categoryId: snacks.id, amount: 15_000, date: '2026-10-17' }]);
    await uc.setBudget(deps, t.ws, { categoryId: snacks.id, limit: 100_000 });
    await deps.catalog.saveAlias(t.ws, { alias: 'chiki', kind: 'CATEGORY', value: snacks.id });
    await uc.deleteCategory(deps, t.ws, snacks.id, t.cat('Food & Drink'));
    expect((await deps.catalog.listCategories(t.ws)).some(c => c.id === snacks.id)).toBe(false);
    const entry = (await uc.listEntries(deps, t.ws, { limit: 10 })).items.find(e => e.id === id)!;
    expect(entry.transactions[0].category_id).toBe(t.cat('Food & Drink'));
    expect(entry.command).toMatchObject({ categoryId: t.cat('Food & Drink') });
    expect((await uc.getBudgetStatus(deps, t.ws)).budgets).toMatchObject([{ categoryId: t.cat('Food & Drink'), spent: 15_000 }]);
    expect(await deps.catalog.listAliases(t.ws)).toEqual([{ alias: 'chiki', kind: 'CATEGORY', value: t.cat('Food & Drink') }]);
    await deps.catalog.createCategory(t.ws, { name: 'Snacks', kind: 'EXPENSE' }); // name is free
    await expect(uc.deleteCategory(deps, t.ws, t.cat('Fees'), t.cat('Other'))).rejects.toMatchObject({ code: 'BUILT_IN' });
    await expect(uc.deleteCategory(deps, t.ws, t.cat('Food & Drink'), t.cat('Salary'))).rejects.toMatchObject({ code: 'WRONG_CATEGORY_KIND' });
  });
});

describe('crypto accounts', () => {
  it('have their own Main pocket in their currency, so a BTC balance can be set and updated', async () => {
    const t = await setup('btc@test');
    const btc = await uc.createAccount(deps, t.ws, { name: 'TokoCrypto', kind: 'EXCHANGE', currency: 'BTC', openingBalance: 250_000 });
    const pocket = (await deps.catalog.listEnvelopes(t.ws)).find(e => e.currency_code === 'BTC')!;
    expect(pocket).toMatchObject({ name: 'Main', account_id: btc.id });
    await uc.updateBalance(deps, t.ws, btc.id, { actual: 300_000 });
    const b = await uc.getBalances(deps, t.ws);
    expect(b.accounts.find(a => a.id === btc.id)!.balance).toBe(300_000);
    expect(b.envelopes.find(e => e.id === pocket.id)!.balance).toBe(300_000);
    expect((await deps.catalog.listEnvelopes(t.ws)).filter(e => e.currency_code === 'BTC')).toHaveLength(1);
  });
});

describe('first sign-in', () => {
  it('seeds exactly one workspace when several requests arrive at once', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => deps.catalog.ensureWorkspace('rush@test')));
    expect(new Set(ids.map(x => x.workspaceId)).size).toBe(1);
    expect(await deps.catalog.listAccounts(ids[0].workspaceId)).toHaveLength(3);
  });
});
