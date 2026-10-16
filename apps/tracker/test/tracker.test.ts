// Integration test: use cases and D1 repositories against SQLite with the real migration.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as uc from '../src/application/usecases';
import { D1Catalog, D1Ledger } from '../src/infrastructure/d1';
import { testD1 } from './d1shim';

let deps: uc.Deps;
// Saturday 17 Oct 2026, 10:00 in Jakarta.
const NOW = Date.parse('2026-10-17T03:00:00Z');

beforeAll(() => {
  const db = testD1(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), now: () => NOW };
});

async function setup(email: string) {
  const { workspaceId: ws } = await deps.catalog.ensureWorkspace(email);
  const [envelopes, categories] = await Promise.all([deps.catalog.listEnvelopes(ws), deps.catalog.listCategories(ws)]);
  const cat = (n: string) => categories.find(c => c.name === n)!.id;
  const monthly = envelopes.find(e => e.name === 'Monthly')!.id;
  const bca = await uc.createAccount(deps, ws, { name: 'BCA', kind: 'BANK', provider: 'bca', openingBalance: 10_000_000 });
  const gopay = await uc.createAccount(deps, ws, { name: 'GoPay', kind: 'EWALLET', provider: 'gopay' });
  const friends = (await deps.catalog.listAccounts(ws)).find(a => a.kind === 'IOU')!.id;
  return { ws, cat, monthly, bca: bca.id, gopay: gopay.id, friends };
}

const sum = (xs: { balance: number }[]) => xs.reduce((s, x) => s + x.balance, 0);

describe('tracker', () => {
  it('records expenses, transfers with fees and split bills, and stays balanced', async () => {
    const t = await setup('a@test');
    await uc.recordTransactions(deps, t.ws, [
      { type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Food & Drink'), amount: 100_000, date: '2026-10-17', merchant: 'Pizza Hut', split: { people: 3, iouAccountId: t.friends } },
      { type: 'TRANSFER', fromAccountId: t.bca, toAccountId: t.gopay, amount: 500_000, fee: 2_500, date: '2026-10-17' },
      { type: 'EXPENSE', accountId: t.gopay, categoryId: t.cat('Coffee'), amount: 25_000, date: '2026-10-16' },
    ]);
    const b = await uc.getBalances(deps, t.ws);
    const bal = (id: string) => b.accounts.find(a => a.id === id)!.balance;
    expect(bal(t.bca)).toBe(10_000_000 - 100_000 - 500_000 - 2_500);
    expect(bal(t.gopay)).toBe(475_000);
    expect(bal(t.friends)).toBe(66_666); // they owe me; my share was 33,334
    expect(sum(b.accounts)).toBe(sum(b.envelopes)); // the ledger invariant
    // Only spending leaves the envelope; money lent to friends is still mine.
    expect(b.envelopes.find(e => e.id === t.monthly)!.balance).toBe(10_000_000 - 33_334 - 2_500 - 25_000);
  });

  it('keeps workspaces apart', async () => {
    const a = await setup('owner-a@test');
    const b = await setup('owner-b@test');
    await uc.recordTransactions(deps, a.ws, [{ type: 'EXPENSE', accountId: a.bca, categoryId: a.cat('Coffee'), amount: 30_000, date: '2026-10-17' }]);
    // B cannot spend from A's account, nor read or delete A's transactions.
    await expect(uc.recordTransactions(deps, b.ws, [{ type: 'EXPENSE', accountId: a.bca, categoryId: b.cat('Coffee'), amount: 1, date: '2026-10-17' }]))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const aList = await uc.listTransactions(deps, a.ws, { limit: 50 });
    const bList = await uc.listTransactions(deps, b.ws, { limit: 50 });
    expect(bList.items.some(x => aList.items.some(y => y.id === x.id))).toBe(false);
    await expect(uc.deleteTransaction(deps, b.ws, aList.items[0].id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
    const [id] = await uc.recordTransactions(deps, t.ws, [{ type: 'EXPENSE', accountId: t.bca, categoryId: t.cat('Coffee'), amount: 20_000, date: '2026-10-17', merchant: 'Kopi, "Tuku"' }]);
    expect(await uc.exportCsv(deps, t.ws)).toContain('"kopi, ""tuku"""');
    await uc.deleteTransaction(deps, t.ws, id);
    const b = await uc.getBalances(deps, t.ws);
    expect(b.accounts.find(a => a.id === t.bca)!.balance).toBe(10_000_000);
  });
});
