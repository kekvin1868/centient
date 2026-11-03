// Split bills with named people (Phase 1b step 2): one tab per person, own amounts, unnamed people to Friends.
import { beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './world';

let w: World;
const svc = (ws: string) => w.svc(ws);
const NOW = Date.parse('2026-10-17T03:00:00Z');
beforeAll(() => {
  w = world({ now: () => NOW });
});

async function setup(email: string) {
  const { workspaceId: ws } = await w.repos.workspaces.ensure(email);
  const food = (await w.repos.categories.list(ws)).find(c => c.name === 'Food & Drink')!.id;
  const bca = await svc(ws).accounts.create({
    name: 'BCA',
    kind: 'BANK',
    openingBalance: 10_000_000,
  });
  const bill = (split: object, amount = 100_000, accountId = bca.id) =>
    ({
      type: 'EXPENSE',
      accountId,
      categoryId: food,
      amount,
      date: '2026-10-17',
      merchant: 'Gift',
      split,
    }) as const;
  const balance = async (name: string) =>
    (await svc(ws).ledger.balances()).accounts.find(a => a.name === name)?.balance;
  return { ws, bca: bca.id, bill, balance };
}

describe('split bill with named people', () => {
  it('gives each person a tab and keeps my share as the only spending (T1, T2)', async () => {
    const t = await setup('s1@test');
    const [id] = await svc(t.ws).ledger.record([
      t.bill({
        people: 4,
        parties: [
          { name: 'Andi', share: 10_000 },
          { name: 'Budi', share: 25_000 },
          { name: 'Cici', share: 25_000 },
        ],
      }),
    ]);
    expect(await t.balance('BCA')).toBe(9_900_000);
    expect(await t.balance('Andi')).toBe(10_000);
    expect(await t.balance('Budi')).toBe(25_000);
    expect(await t.balance('Cici')).toBe(25_000);
    const e = (await svc(t.ws).ledger.listEntries({ limit: 10 })).items.find(x => x.id === id)!;
    const spent = e.transactions
      .filter(x => x.type === 'EXPENSE')
      .flatMap(x => x.allocations)
      .reduce((s, a) => s - a.amount, 0);
    expect(spent).toBe(40_000);
    // The saved command keeps ids, not names, so a rename follows.
    expect(JSON.stringify(e.command)).not.toContain('Andi');
    expect(e.transactions.map(x => x.note)).toEqual(
      expect.arrayContaining(['Split with Andi, Budi, Cici']),
    );
  });

  it('reuses a tab by name ignoring case, and one tab per currency (T13)', async () => {
    const t = await setup('s2@test');
    await svc(t.ws).ledger.record([
      t.bill({ people: 2, parties: [{ name: 'Andi', share: 50_000 }] }),
      t.bill({ people: 2, parties: [{ name: 'andi', share: 20_000 }] }),
    ]);
    expect(await t.balance('Andi')).toBe(70_000);
    const wise = await svc(t.ws).accounts.create({
      name: 'Wise',
      kind: 'BANK',
      currency: 'USD',
      openingBalance: 500_00,
    });
    await svc(t.ws).ledger.record([
      t.bill({ people: 2, parties: [{ name: 'Andi', share: 10_00 }] }, 30_00, wise.id),
    ]);
    expect(await t.balance('Andi (USD)')).toBe(10_00);
    expect(await t.balance('Andi')).toBe(70_000);
  });

  it('sends unnamed people to Friends and named ones to their tab (T15)', async () => {
    const t = await setup('s3@test');
    await svc(t.ws).ledger.record([
      t.bill({
        people: 4,
        parties: [{ name: 'Andi', share: 25_000 }, { share: 25_000 }, { share: 20_000 }],
      }),
    ]);
    expect(await t.balance('Andi')).toBe(25_000);
    expect(await t.balance('Friends')).toBe(45_000);
    expect(await t.balance('BCA')).toBe(9_900_000);
  });

  it('refuses shares that leave me nothing, a wrong head count and the same person twice (T5)', async () => {
    const t = await setup('s4@test');
    const rec = (split: object) => svc(t.ws).ledger.record([t.bill(split)]);
    await expect(
      rec({
        people: 3,
        parties: [
          { name: 'A', share: 60_000 },
          { name: 'B', share: 40_000 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SHARE' });
    await expect(rec({ people: 4, parties: [{ name: 'A', share: 1 }] })).rejects.toMatchObject({
      code: 'INVALID_SPLIT',
    });
    await expect(
      rec({
        people: 3,
        parties: [
          { name: 'A', share: 1 },
          { name: 'a', share: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PARTY' });
  });

  it('will not use a hidden tab without asking', async () => {
    const t = await setup('s5@test');
    await svc(t.ws).ledger.record([
      t.bill({ people: 2, parties: [{ name: 'Andi', share: 5_000 }] }),
    ]);
    const andi = (await w.repos.accounts.list(t.ws)).find(a => a.name === 'Andi')!;
    await svc(t.ws).accounts.update(andi.id, { archived: true });
    await expect(
      svc(t.ws).ledger.record([t.bill({ people: 2, parties: [{ name: 'Andi', share: 5_000 }] })]),
    ).rejects.toMatchObject({ code: 'TAB_HIDDEN' });
  });

  it('rebuilds the tabs when the entry is edited, and old head-count splits still work (T14)', async () => {
    const t = await setup('s6@test');
    const [id] = await svc(t.ws).ledger.record([
      t.bill({
        people: 3,
        parties: [
          { name: 'Andi', share: 30_000 },
          { name: 'Budi', share: 30_000 },
        ],
      }),
    ]);
    await svc(t.ws).ledger.edit(
      id,
      t.bill({
        people: 3,
        parties: [
          { name: 'Andi', share: 10_000 },
          { name: 'Budi', share: 50_000 },
        ],
      }),
    );
    expect(await t.balance('Andi')).toBe(10_000);
    expect(await t.balance('Budi')).toBe(50_000);
    await svc(t.ws).ledger.record([t.bill({ people: 3 })]);
    expect(await t.balance('Friends')).toBe(66_666);
  });

  it('lets a person pay nothing yet', async () => {
    const t = await setup('s7@test');
    await svc(t.ws).ledger.record([t.bill({ people: 2, parties: [{ name: 'Andi', share: 0 }] })]);
    expect(await t.balance('Andi')).toBe(0);
    expect(await t.balance('BCA')).toBe(9_900_000);
  });
});

describe('a person who hands money over now (T8)', () => {
  it('keeps the full share on their tab, then moves what they paid into my account', async () => {
    const t = await setup('s8@test');
    const cash = await svc(t.ws).accounts.create({ name: 'Cash', kind: 'CASH' });
    const [id] = await svc(t.ws).ledger.record([
      t.bill({
        people: 4,
        parties: [
          { name: 'Andi', share: 25_000, paid: { amount: 10_000, accountId: cash.id } },
          { name: 'Budi', share: 25_000 },
          { name: 'Cici', share: 25_000 },
        ],
      }),
    ]);
    expect(await t.balance('BCA')).toBe(9_900_000);
    expect(await t.balance('Andi')).toBe(15_000);
    expect(await t.balance('Budi')).toBe(25_000);
    expect(await t.balance('Cash')).toBe(10_000);
    // One entry: deleting it takes the payment with it.
    await svc(t.ws).ledger.remove(id);
    expect(await t.balance('Cash')).toBe(0);
    expect(await t.balance('Andi')).toBe(0);
  });

  it('refuses more than the share, an unnamed payer and an IOU as the receiving account', async () => {
    const t = await setup('s9@test');
    const cash = await svc(t.ws).accounts.create({ name: 'Cash', kind: 'CASH' });
    const rec = (parties: object[]) =>
      svc(t.ws).ledger.record([t.bill({ people: parties.length + 1, parties })]);
    await expect(
      rec([{ name: 'Andi', share: 5_000, paid: { amount: 6_000, accountId: cash.id } }]),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT' });
    await expect(
      rec([{ share: 5_000, paid: { amount: 1_000, accountId: cash.id } }]),
    ).rejects.toMatchObject({ code: 'PAID_NEEDS_NAME' });
    const friends = await svc(t.ws).accounts.create({ name: 'Friends', kind: 'IOU' });
    await expect(
      rec([{ name: 'Andi', share: 5_000, paid: { amount: 1_000, accountId: friends.id } }]),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT' });
  });
});
