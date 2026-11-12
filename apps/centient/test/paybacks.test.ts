// Paid backs tied to split bills (planning/features/product/split-paybacks.agent.md): links, people on a bill,
// and what deleting or shrinking a bill does to the Paid backs that pay it.
import { beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './world';

let w: World;
const svc = (ws: string) => w.svc(ws);
const NOW = Date.parse('2026-11-10T03:00:00Z');
beforeAll(() => {
  w = world({ now: () => NOW });
});

async function setup(email: string) {
  const { workspaceId: ws } = await w.repos.workspaces.ensure(email);
  const food = (await w.repos.categories.list(ws)).find(c => c.name === 'Food & Drink')!.id;
  const bca = (
    await svc(ws).accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 })
  ).id;
  const ledger = () => svc(ws).ledger;
  /** A bill with asdf (and anyone else named) owing `share` each. */
  const bill = async (merchant: string, date: string, shares: Record<string, number>) => {
    const parties = Object.entries(shares).map(([name, share]) => ({ name, share }));
    const amount = Object.values(shares).reduce((s, x) => s + x, 0) + 100_000;
    const [id] = await ledger().record([
      {
        type: 'EXPENSE',
        accountId: bca,
        categoryId: food,
        amount,
        date,
        merchant,
        split: { people: parties.length + 1, parties },
      },
    ]);
    return id;
  };
  const tab = async (name: string) =>
    (await ledger().balances()).accounts.find(a => a.name === name)!;
  const payback = async (
    name: string,
    amount: number,
    bills: { entryId: string; amount: number }[],
    gift?: number,
  ) =>
    (
      await ledger().record([
        {
          type: 'TRANSFER',
          fromAccountId: (await tab(name)).id,
          toAccountId: bca,
          amount,
          gift,
          bills,
          date: '2026-11-10',
        },
      ])
    )[0];
  const people = async (billId: string) =>
    (await ledger().listEntries({ limit: 50 })).items.find(e => e.id === billId)!.people;
  const exists = async (id: string) =>
    (await ledger().listEntries({ limit: 50 })).items.some(e => e.id === id);
  return { ws, bca, bill, tab, payback, people, exists, ledger };
}

describe('Paid back tied to bills', () => {
  it('splits one Paid back over two bills and shows who paid on each', async () => {
    const t = await setup('pb1@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 150_000 });
    const b = await t.bill('Pizza', '2026-11-05', { asdf: 100_000 });
    await t.payback('asdf', 190_000, [
      { entryId: a, amount: 150_000 },
      { entryId: b, amount: 40_000 },
    ]);
    expect((await t.people(a))![0]).toMatchObject({ share: 150_000, paid: 150_000 });
    expect((await t.people(b))![0]).toMatchObject({ share: 100_000, paid: 40_000 });
    const bills = await t.ledger().tabBills((await t.tab('asdf')).id);
    expect(bills.map(x => [x.title, x.share, x.paid])).toEqual([
      ['Kulkas', 150_000, 150_000],
      ['Pizza', 100_000, 40_000],
    ]);
    expect((await t.tab('asdf')).balance).toBe(60_000);
  });

  it('refuses links that overfill a bill, add up to more than was paid, or name a bill the person is not on', async () => {
    const t = await setup('pb2@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 150_000 });
    const other = await t.bill('Bakso', '2026-11-02', { zxcv: 50_000 });
    await expect(
      t.payback('asdf', 200_000, [{ entryId: a, amount: 160_000 }]),
    ).rejects.toMatchObject({
      code: 'BILL_OVERPAID',
    });
    await expect(
      t.payback('asdf', 100_000, [{ entryId: a, amount: 120_000 }]),
    ).rejects.toMatchObject({ code: 'INVALID_BILLS' });
    await expect(
      t.payback('asdf', 50_000, [{ entryId: other, amount: 50_000 }]),
    ).rejects.toMatchObject({
      code: 'NOT_ON_BILL',
    });
    // The gift is not part of what pays the bill.
    await expect(
      t.payback('asdf', 200_000, [{ entryId: a, amount: 150_000 }], 60_000),
    ).rejects.toMatchObject({ code: 'INVALID_BILLS' });
  });

  it('editing a Paid back does not count itself as already paid', async () => {
    const t = await setup('pb3@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 150_000 });
    const p = await t.payback('asdf', 150_000, [{ entryId: a, amount: 150_000 }]);
    await t.ledger().edit(p, {
      type: 'TRANSFER',
      fromAccountId: (await t.tab('asdf')).id,
      toAccountId: t.bca,
      amount: 150_000,
      bills: [{ entryId: a, amount: 150_000 }],
      date: '2026-11-10',
    });
    expect((await t.people(a))![0].paid).toBe(150_000);
  });
});

describe('deleting a bill with Paid backs tied', () => {
  it('asks first: no mode writes nothing', async () => {
    const t = await setup('pb4@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    await t.payback('asdf', 200_000, [{ entryId: a, amount: 166_666 }], 33_334);
    await expect(t.ledger().remove(a)).rejects.toMatchObject({ code: 'PAYBACKS_TIED' });
    expect(await t.exists(a)).toBe(true);
  });

  it('never received: the Paid back goes, gift and all (the stranded-gift case)', async () => {
    const t = await setup('pb5@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    const p = await t.payback('asdf', 200_000, [{ entryId: a, amount: 166_666 }], 33_334);
    await t.ledger().remove(a, 'NEVER_RECEIVED');
    expect(await t.exists(p)).toBe(false);
    expect((await t.tab('asdf')).balance).toBe(0);
    expect((await t.tab('BCA')).balance).toBe(5_000_000);
  });

  it('never received: a Paid back over two bills only loses the deleted bill part', async () => {
    const t = await setup('pb6@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    const b = await t.bill('Pizza', '2026-11-05', { asdf: 100_000 });
    const p = await t.payback('asdf', 266_666, [
      { entryId: a, amount: 166_666 },
      { entryId: b, amount: 100_000 },
    ]);
    await t.ledger().remove(b, 'NEVER_RECEIVED');
    const left = (await t.ledger().listEntries({ limit: 50 })).items.find(e => e.id === p)!;
    expect(left.command).toMatchObject({
      amount: 166_666,
      bills: [{ entryId: a, amount: 166_666 }],
    });
    expect((await t.people(a))![0].paid).toBe(166_666);
    expect((await t.tab('asdf')).balance).toBe(0);
  });

  it('return money: the Paid back stays, the tab goes below 0', async () => {
    const t = await setup('pb7@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    const p = await t.payback('asdf', 200_000, [{ entryId: a, amount: 166_666 }], 33_334);
    await t.ledger().remove(a, 'RETURN');
    const left = (await t.ledger().listEntries({ limit: 50 })).items.find(e => e.id === p)!;
    expect(left.command).toMatchObject({ amount: 200_000 });
    expect((left.command as { bills?: unknown }).bills).toBeUndefined();
    // Paid 200.000, 33.334 of it a gift: 166.666 to give back.
    expect((await t.tab('asdf')).balance).toBe(-166_666);
  });
});

describe('editing a bill below what someone paid', () => {
  const edit = async (
    t: Awaited<ReturnType<typeof setup>>,
    id: string,
    share: number,
    mode?: 'RETURN' | 'NEVER_RECEIVED',
  ) => {
    const e = (await t.ledger().listEntries({ limit: 50 })).items.find(x => x.id === id)!;
    const cmd = e.command as Extract<NonNullable<typeof e.command>, { type: 'EXPENSE' }>;
    await t.ledger().edit(
      id,
      {
        ...cmd,
        amount: share + 100_000,
        split: { ...cmd.split!, parties: [{ ...cmd.split!.parties![0], share }] },
      },
      mode,
    );
  };

  it('asks, then return money keeps the money and the tab owes back the extra', async () => {
    const t = await setup('pb8@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    await t.payback('asdf', 166_666, [{ entryId: a, amount: 166_666 }]);
    await expect(edit(t, a, 100_000)).rejects.toMatchObject({ code: 'PAYBACKS_TIED' });
    await edit(t, a, 100_000, 'RETURN');
    expect((await t.people(a))![0]).toMatchObject({ share: 100_000, paid: 100_000 });
    expect((await t.tab('asdf')).balance).toBe(-66_666);
  });

  it('never received shrinks the Paid back to the new share', async () => {
    const t = await setup('pb9@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 166_666 });
    await t.payback('asdf', 166_666, [{ entryId: a, amount: 166_666 }]);
    await edit(t, a, 100_000, 'NEVER_RECEIVED');
    expect((await t.people(a))![0]).toMatchObject({ share: 100_000, paid: 100_000 });
    expect((await t.tab('asdf')).balance).toBe(0);
  });

  it('a raise needs no question', async () => {
    const t = await setup('pb10@test');
    const a = await t.bill('Kulkas', '2026-11-01', { asdf: 100_000 });
    await t.payback('asdf', 100_000, [{ entryId: a, amount: 100_000 }]);
    await edit(t, a, 150_000);
    expect((await t.people(a))![0]).toMatchObject({ share: 150_000, paid: 100_000 });
  });
});

describe('kept until', () => {
  it('a tab can be kept until a day, and cleared', async () => {
    const t = await setup('pb11@test');
    await t.bill('Kulkas', '2026-11-01', { asdf: 100_000 });
    const id = (await t.tab('asdf')).id;
    await svc(t.ws).accounts.update(id, { kept_until: '2026-11-30' });
    expect((await t.tab('asdf')).kept_until).toBe('2026-11-30');
    await svc(t.ws).accounts.update(id, { kept_until: null });
    expect((await t.tab('asdf')).kept_until).toBeNull();
  });
});
