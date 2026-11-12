// The Inbox: the duplicate rule, a CSV import, reviewing (add, link, dismiss, add all) and undoing an import;
// services and D1 repos against SQLite with the real migrations.
import { describe, expect, it } from 'vitest';
import { suggestDuplicates } from '../src/domain/inbox';
import { world } from './world';

const at = (day: string) => Date.parse(`${day}T03:00:00Z`);

async function workspace() {
  const w = world({ now: () => at('2026-11-12') });
  const { workspaceId: ws } = await w.repos.workspaces.ensure('inbox@test');
  const svc = () => w.svc(ws);
  const cat = (name: string) =>
    w.repos.categories.list(ws).then(cs => cs.find(c => c.name === name)!.id);
  const bca = (
    await svc().accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 })
  ).id;
  const food = await cat('Food & Drink');
  const row = (date: string, amount: number, merchant?: string, o: object = {}) => ({
    date,
    amount,
    merchant,
    accountId: bca,
    ...o,
  });
  const balance = async () =>
    (await svc().ledger.balances()).accounts.find(a => a.id === bca)!.balance;
  return { w, ws, svc, cat, bca, food, row, balance };
}

describe('the duplicate rule', () => {
  const line = (entryId: string, day: string, amount = -25_000, accountId = 'bca') => ({
    entryId,
    accountId,
    amount,
    day,
  });
  const p = (date: string, amount = -25_000) => ({ accountId: 'bca', amount, date });

  it('matches account, signed amount and a day either side, nearest first', () => {
    const lines = [
      line('far', '2026-11-10'),
      line('next', '2026-11-13'),
      line('same', '2026-11-12'),
    ];
    expect(suggestDuplicates([p('2026-11-12')], lines)).toEqual(['same']);
    expect(suggestDuplicates([p('2026-11-14')], lines)).toEqual(['next']);
    expect(suggestDuplicates([p('2026-11-08')], lines)).toEqual([null]);
    expect(suggestDuplicates([p('2026-11-12', 25_000)], lines)).toEqual([null]);
    expect(
      suggestDuplicates([p('2026-11-12')], [line('x', '2026-11-12', -25_000, 'gopay')]),
    ).toEqual([null]);
  });

  it('offers an entry to one payment only', () => {
    expect(
      suggestDuplicates([p('2026-11-12'), p('2026-11-12')], [line('one', '2026-11-12')]),
    ).toEqual(['one', null]);
  });
});

describe('inbox service', () => {
  it('imports rows for review with the entry each may duplicate', async () => {
    const t = await workspace();
    const [coffee] = await t.svc().ledger.record([
      {
        type: 'EXPENSE',
        accountId: t.bca,
        categoryId: t.food,
        amount: 25_000,
        date: '2026-11-10',
        merchant: 'kopi senja',
      },
    ]);
    const r = await t
      .svc()
      .inbox.importRows([
        t.row('2026-11-09', -32_000, 'Nasi padang', { categoryId: t.food }),
        t.row('2026-11-10', -25_000, 'KOPI SENJA'),
        t.row('2026-11-11', 9_500_000, 'Gaji', { note: 'November' }),
      ]);
    expect(r).toMatchObject({ added: 3, skipped: 0 });

    const list = await t.svc().inbox.list();
    expect(list.waiting).toBe(3);
    expect(list.items).toEqual([
      expect.objectContaining({
        date: '2026-11-09',
        amount: -32_000,
        merchant: 'Nasi padang',
        categoryId: t.food,
        importId: r.importId,
        suggested: null,
      }),
      expect.objectContaining({
        merchant: 'KOPI SENJA',
        suggested: { entryId: coffee, date: '2026-11-10', merchant: 'kopi senja' },
      }),
      expect.objectContaining({ amount: 9_500_000, note: 'November', suggested: null }),
    ]);
    expect(list.imports).toEqual([
      expect.objectContaining({ id: r.importId, rows: 3, review: 3, added: 0 }),
    ]);
    // Nothing is saved until it is reviewed.
    expect(await t.balance()).toBe(5_000_000 - 25_000);
  });

  it('adds nothing when the same file comes in again, but keeps two identical rows of one file', async () => {
    const t = await workspace();
    const rows = [t.row('2026-11-10', -18_000, 'Parkir'), t.row('2026-11-10', -18_000, 'parkir')];
    expect(await t.svc().inbox.importRows(rows)).toMatchObject({ added: 2, skipped: 0 });
    expect(
      await t.svc().inbox.importRows([...rows, t.row('2026-11-11', -5_000, 'Parkir')]),
    ).toMatchObject({ added: 1, skipped: 2 });
    expect((await t.svc().inbox.list()).waiting).toBe(3);
  });

  it("refuses unreal dates, a person's tab and a category of the wrong kind", async () => {
    const t = await workspace();
    const tab = await t.svc().accounts.create({ name: 'Andi', kind: 'IOU' });
    const imports = (row: object) =>
      t.svc().inbox.importRows([{ ...t.row('2026-11-10', -1), ...row }]);
    await expect(imports({ date: '2026-02-30' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(imports({ accountId: tab.id })).rejects.toMatchObject({ code: 'INBOX_ACCOUNT' });
    await expect(imports({ accountId: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(imports({ categoryId: await t.cat('Salary') })).rejects.toMatchObject({
      code: 'WRONG_CATEGORY_KIND',
    });
    expect((await t.svc().inbox.list()).waiting).toBe(0);
  });

  it('add saves an entry, link saves none, dismiss drops it; each only once', async () => {
    const t = await workspace();
    const [lunch] = await t
      .svc()
      .ledger.record([
        {
          type: 'EXPENSE',
          accountId: t.bca,
          categoryId: t.food,
          amount: 40_000,
          date: '2026-11-10',
        },
      ]);
    await t
      .svc()
      .inbox.importRows([
        t.row('2026-11-09', -32_000, 'Nasi padang'),
        t.row('2026-11-10', -40_000, 'Lunch'),
        t.row('2026-11-11', 500_000, 'Refund'),
        t.row('2026-11-11', -7_000, 'Junk'),
      ]);
    const [nasi, dup, refund, junk] = (await t.svc().inbox.list()).items;

    await t.svc().inbox.setCategory(nasi.id, t.food);
    await t.svc().inbox.add(nasi.id);
    await t.svc().inbox.link(dup.id);
    await t.svc().inbox.add(refund.id);
    await t.svc().inbox.dismiss(junk.id);

    expect(await t.balance()).toBe(5_000_000 - 40_000 - 32_000 + 500_000);
    const { items } = await t.svc().ledger.listEntries({ limit: 10 });
    const commands = items.map(e => e.command);
    expect(commands).toContainEqual(
      expect.objectContaining({
        type: 'EXPENSE',
        amount: 32_000,
        merchant: 'Nasi padang',
        categoryId: t.food,
        date: '2026-11-09',
      }),
    );
    expect(commands).toContainEqual(
      expect.objectContaining({
        type: 'INCOME',
        amount: 500_000,
        categoryId: await t.cat('Other income'),
      }),
    );
    expect(items.filter(e => e.id === lunch)).toHaveLength(1);

    const list = await t.svc().inbox.list();
    expect(list.waiting).toBe(0);
    expect(list.imports[0]).toMatchObject({ rows: 4, review: 0, added: 2 });
    await expect(t.svc().inbox.add(nasi.id)).rejects.toMatchObject({ code: 'INBOX_DONE' });
    await expect(t.svc().inbox.link(refund.id)).rejects.toMatchObject({ code: 'INBOX_DONE' });
    await expect(t.svc().inbox.dismiss('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('link needs a suggestion, and a suggestion whose entry was deleted is gone', async () => {
    const t = await workspace();
    const [lunch] = await t
      .svc()
      .ledger.record([
        {
          type: 'EXPENSE',
          accountId: t.bca,
          categoryId: t.food,
          amount: 40_000,
          date: '2026-11-10',
        },
      ]);
    await t.svc().inbox.importRows([t.row('2026-11-10', -40_000), t.row('2026-11-10', -1_000)]);
    const [dup, plain] = (await t.svc().inbox.list()).items;
    await expect(t.svc().inbox.link(plain.id)).rejects.toMatchObject({ code: 'NO_SUGGESTION' });
    await t.svc().ledger.remove(lunch);
    expect((await t.svc().inbox.list()).items[0].suggested).toBeNull();
    await expect(t.svc().inbox.link(dup.id)).rejects.toMatchObject({ code: 'NO_SUGGESTION' });
  });

  it('adds all unmatched in one go and leaves the matched ones', async () => {
    const t = await workspace();
    await t
      .svc()
      .ledger.record([
        {
          type: 'EXPENSE',
          accountId: t.bca,
          categoryId: t.food,
          amount: 40_000,
          date: '2026-11-10',
        },
      ]);
    const rows = Array.from({ length: 120 }, (_, i) =>
      t.row('2026-11-05', -(1_000 + i), `Shop ${i}`),
    );
    await t.svc().inbox.importRows([...rows, t.row('2026-11-10', -40_000, 'Lunch')]);
    expect(await t.svc().inbox.addAll()).toBe(120);
    const list = await t.svc().inbox.list();
    expect(list.waiting).toBe(1);
    expect(list.items[0].merchant).toBe('Lunch');
    const spent = rows.reduce((s, r) => s - r.amount, 0);
    expect(await t.balance()).toBe(5_000_000 - 40_000 - spent);
  });

  it('undoes an import: its entries and items go, linked entries stay', async () => {
    const t = await workspace();
    const [lunch] = await t
      .svc()
      .ledger.record([
        {
          type: 'EXPENSE',
          accountId: t.bca,
          categoryId: t.food,
          amount: 40_000,
          date: '2026-11-10',
        },
      ]);
    const first = await t.svc().inbox.importRows([t.row('2026-11-01', -9_000, 'Kept')]);
    await t.svc().inbox.addAll(first.importId);
    const second = await t
      .svc()
      .inbox.importRows([
        t.row('2026-11-09', -32_000, 'Nasi padang'),
        t.row('2026-11-10', -40_000, 'Lunch'),
        t.row('2026-11-11', -7_000, 'Waiting'),
      ]);
    const [nasi, dup] = (await t.svc().inbox.list()).items;
    await t.svc().inbox.add(nasi.id);
    await t.svc().inbox.link(dup.id);

    expect(await t.svc().inbox.undoImport(second.importId)).toEqual({ removedEntries: 1 });
    expect(await t.balance()).toBe(5_000_000 - 40_000 - 9_000);
    const { items } = await t.svc().ledger.listEntries({ limit: 10 });
    expect(items.some(e => e.id === lunch)).toBe(true);
    const list = await t.svc().inbox.list();
    expect(list.waiting).toBe(0);
    expect(list.imports.map(i => i.id)).toEqual([first.importId]);
    await expect(t.svc().inbox.undoImport(second.importId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('keeps the Inbox apart per workspace and clears it for a deleted account', async () => {
    const t = await workspace();
    const r = await t.svc().inbox.importRows([t.row('2026-11-10', -1_000)]);
    const [item] = (await t.svc().inbox.list()).items;
    const { workspaceId: other } = await t.w.repos.workspaces.ensure('someone@else');
    expect((await t.w.svc(other).inbox.list()).waiting).toBe(0);
    await expect(t.w.svc(other).inbox.add(item.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(t.w.svc(other).inbox.undoImport(r.importId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await t.svc().accounts.remove(t.bca);
    expect((await t.svc().inbox.list()).waiting).toBe(0);
  });
});
