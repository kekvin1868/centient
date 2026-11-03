import { parseQuickAdd, type QAContext } from '@centient/quickadd';
import { describe, expect, it } from 'vitest';
import { chipView, fromCommand, fromDraft, toCommand, withMyPotShare, withPot } from './form';

const ctx: QAContext = {
  today: '2026-10-20',
  accounts: [
    { id: 'bca', name: 'BCA', kind: 'BANK', provider: 'BCA', currency_code: 'IDR' },
    { id: 'gopay', name: 'GoPay', kind: 'EWALLET', provider: 'GOPAY', currency_code: 'IDR' },
    { id: 'friends', name: 'Friends', kind: 'IOU', provider: null, currency_code: 'IDR' },
  ],
  categories: [{ id: 'food', name: 'Food & Drink', kind: 'EXPENSE' }],
  lastAccountId: 'bca',
};
const item = (text: string, c: QAContext = ctx) =>
  fromDraft(parseQuickAdd(text, c)[0], '0', 'friends');

describe('chipView', () => {
  it('is ready when everything resolved', () => {
    const i = item('kopi 25rb gopay');
    expect(chipView(i)).toEqual({ state: 'ready' });
    expect(toCommand(i.form)).toEqual({
      command: expect.objectContaining({
        type: 'EXPENSE',
        accountId: 'gopay',
        categoryId: 'food',
        amount: 25000,
      }),
    });
  });

  it('asks which amount for a bare number, then is ready once picked', () => {
    const i = item('makan 100 bagi 3');
    expect(chipView(i)).toMatchObject({ state: 'ask', ask: 'amount' });
    const picked = { ...i, askAmount: false, form: { ...i.form, amount: 100000 } };
    expect(chipView(picked)).toEqual({ state: 'ready' });
    expect(toCommand(picked.form)).toMatchObject({
      command: { split: { people: 3, iouAccountId: 'friends' } },
    });
  });

  it('asks for the charged rupiah on a foreign price', () => {
    const v = chipView(item('lunch 20 usd bca'));
    expect(v).toMatchObject({ state: 'ask', ask: 'charged' });
    expect(v.state === 'ask' && v.question).toContain('USD 20.00');
  });

  it('asks which account when none is known', () => {
    expect(chipView(item('kopi 25rb', { ...ctx, lastAccountId: null }))).toMatchObject({
      state: 'ask',
      ask: 'account',
    });
  });

  it('needs the form when the category is unknown', () => {
    expect(chipView(item('sesuatu 50rb'))).toEqual({
      state: 'incomplete',
      missing: 'Pick a category',
    });
  });
});

describe('toCommand / fromCommand', () => {
  it('round-trips a transfer with a fee and rejects the same account twice', () => {
    const cmd = {
      type: 'TRANSFER' as const,
      fromAccountId: 'bca',
      toAccountId: 'gopay',
      amount: 100000,
      fee: 2500,
      date: '2026-10-20',
    };
    expect(toCommand(fromCommand(cmd))).toEqual({ command: { ...cmd, note: undefined } });
    expect(toCommand({ ...fromCommand(cmd), toAccountId: 'bca' })).toEqual({
      error: 'Pick two different accounts',
    });
  });

  it('needs an amount', () => {
    expect(
      toCommand({
        ...fromCommand({
          type: 'INCOME',
          accountId: 'bca',
          categoryId: 'x',
          amount: 1,
          date: '2026-10-20',
        }),
        amount: null,
      }),
    ).toEqual({ error: 'Enter an amount' });
  });
});

describe('split bills in the form (T1-T6)', () => {
  const bill = {
    type: 'EXPENSE' as const,
    accountId: 'bca',
    categoryId: 'food',
    amount: 100_000,
    date: '2026-10-20',
  };
  const tabName = (id: string) => ({ andi: 'Andi', budi: 'Budi' })[id] ?? '';

  it('keeps an unnamed equal split as the plain head count (what quick add sends)', () => {
    const r = toCommand(item('makan 90rb bagi 3').form);
    expect(r).toEqual({
      command: expect.objectContaining({ split: { people: 3, iouAccountId: 'friends' } }),
    });
  });

  it('sends names, and the typed amount of one person with the rest shared equally', () => {
    const f = fromCommand({
      ...bill,
      split: { people: 4, parties: [{ share: 25_000 }, { share: 25_000 }, { share: 25_000 }] },
    });
    f.parties[0] = { ...f.parties[0], name: 'Andi', share: 10_000 };
    f.parties[1] = { ...f.parties[1], name: 'Budi' };
    const r = toCommand(f);
    expect(r).toEqual({
      command: expect.objectContaining({
        split: {
          people: 4,
          iouAccountId: undefined,
          parties: [
            { name: 'Andi', share: 10_000 },
            { name: 'Budi', share: 30_000 },
            { share: 30_000 },
          ],
        },
      }),
    });
  });

  it('blocks Save with the shares not adding up (T5) or leaving me nothing', () => {
    const f = fromCommand({ ...bill, split: { people: 3, parties: [{ share: 1 }, { share: 1 }] } });
    expect(
      toCommand({ ...f, parties: f.parties.map((p, i) => ({ ...p, share: i ? 40_000 : 60_000 })) }),
    ).toEqual({
      error: 'Your share must be more than zero',
    });
    expect(
      toCommand({ ...f, myShare: 10_000, parties: f.parties.map(p => ({ ...p, share: 30_000 })) }),
    ).toEqual({ error: "The shares don't add up to the total" });
  });

  it('loads an equal split as automatic and an uneven one as typed, and sends a tab by id until renamed', () => {
    const equal = fromCommand(
      {
        ...bill,
        amount: 90_000,
        split: { people: 3, parties: [{ iouAccountId: 'andi', share: 30_000 }, { share: 30_000 }] },
      },
      tabName,
    );
    expect(equal.parties.map(p => p.share)).toEqual([null, null]);
    expect(equal.parties[0]).toMatchObject({ name: 'Andi', tab: 'andi' });

    const uneven = fromCommand(
      {
        ...bill,
        split: {
          people: 3,
          parties: [
            { iouAccountId: 'andi', share: 10_000 },
            { iouAccountId: 'budi', share: 50_000 },
          ],
        },
      },
      tabName,
    );
    expect(uneven.parties.map(p => p.share)).toEqual([10_000, 50_000]);
    const same = toCommand(uneven);
    expect(same).toEqual({
      command: expect.objectContaining({
        split: {
          people: 3,
          iouAccountId: undefined,
          parties: [
            { iouAccountId: 'andi', share: 10_000 },
            { iouAccountId: 'budi', share: 50_000 },
          ],
        },
      }),
    });
    uneven.parties[0] = { ...uneven.parties[0], name: 'Andy' };
    expect(toCommand(uneven)).toEqual({
      command: expect.objectContaining({
        split: expect.objectContaining({
          parties: [
            { name: 'Andy', share: 10_000 },
            { iouAccountId: 'budi', share: 50_000 },
          ],
        }),
      }),
    });
  });
});

describe('cover the rest / pays later (T6-T8)', () => {
  const base = fromCommand({
    type: 'EXPENSE',
    accountId: 'bca',
    categoryId: 'food',
    amount: 100_000,
    date: '2026-10-20',
    merchant: 'Kado',
    split: { people: 4, parties: [{ share: 25_000 }, { share: 25_000 }, { share: 25_000 }] },
  });
  const withAndi = (o: object) => ({
    ...base,
    parties: [
      { ...base.parties[0], name: 'Andi', share: 10_000, ...o },
      base.parties[1],
      base.parties[2],
    ],
  });

  it('T6: covering from the bill account is one entry where Andi pays 10.000 and the rest stay 25.000', () => {
    const r = toCommand(withAndi({ mode: 'COVER' }));
    expect(r).toEqual({
      command: expect.objectContaining({
        amount: 100_000,
        split: expect.objectContaining({
          parties: [{ name: 'Andi', share: 10_000 }, { share: 25_000 }, { share: 25_000 }],
        }),
      }),
    });
  });

  it('T7: covering from Cash is two entries: the bill shrinks to 85.000 and Cash pays 15.000', () => {
    const r = toCommand(withAndi({ mode: 'COVER', accountId: 'cash' }));
    expect(r).toEqual({
      command: expect.objectContaining({ amount: 85_000 }),
      extra: [
        expect.objectContaining({
          type: 'EXPENSE',
          accountId: 'cash',
          amount: 15_000,
          merchant: 'Kado',
          note: "Covering Andi's part of Kado",
        }),
      ],
    });
  });

  it('T8: pays the rest later keeps 25.000 on the tab and sends what was handed over', () => {
    const r = toCommand(withAndi({ mode: 'LATER', accountId: 'cash' }));
    expect(r).toEqual({
      command: expect.objectContaining({
        amount: 100_000,
        split: expect.objectContaining({
          parties: [
            { name: 'Andi', share: 25_000, paid: { amount: 10_000, accountId: 'cash' } },
            { share: 25_000 },
            { share: 25_000 },
          ],
        }),
      }),
    });
    // The handed-over account defaults to the bill's account, and reloads as a pay-later person.
    const back = fromCommand(
      (r as { command: Parameters<typeof fromCommand>[0] }).command,
      () => 'Andi',
    );
    expect(back.parties[0]).toMatchObject({ mode: 'LATER', share: 10_000, accountId: 'cash' });
    expect(back.parties[1].share).toBeNull();
  });

  it('refuses to cover someone who pays their full share, or a nameless payer-later', () => {
    expect(toCommand(withAndi({ mode: 'COVER', share: 25_000 }))).toEqual({
      error: 'Nothing to cover: they pay their full share',
    });
    expect(toCommand(withAndi({ mode: 'LATER', name: '' }))).toEqual({
      error: 'Name the person who pays later',
    });
  });
});

describe('joining a pot (T9)', () => {
  const start = () =>
    withPot(
      {
        ...fromCommand({
          type: 'EXPENSE',
          accountId: 'bca',
          categoryId: 'food',
          amount: 1,
          date: '2026-10-20',
          merchant: 'Kado',
        }),
        amount: null,
      },
      { total: 100_000, people: 4, manager: 'Andi' },
    );

  it('my share follows total / people until I type my own, and saves as an expense with the pot', () => {
    const f = start();
    expect(f.amount).toBe(25_000);
    expect(withPot(f, { people: 3 }).amount).toBe(33_334);
    expect(toCommand(f)).toEqual({
      command: expect.objectContaining({
        type: 'EXPENSE',
        amount: 25_000,
        pot: { total: 100_000, people: 4, manager: 'Andi' },
      }),
    });
    const mine = withMyPotShare(f, 10_000);
    expect(withPot(mine, { people: 5 }).amount).toBe(10_000);
    expect(withMyPotShare(mine, null).amount).toBe(25_000);
  });

  it('needs the total, refuses a share above it, and reloads as the same pot', () => {
    expect(toCommand({ ...start(), pot: { ...start().pot!, total: null } })).toEqual({
      error: 'Enter the pot total',
    });
    expect(toCommand({ ...start(), amount: 120_000 })).toEqual({
      error: 'Your share cannot be more than the pot',
    });
    const r = toCommand(start()) as { command: Parameters<typeof fromCommand>[0] };
    expect(fromCommand(r.command).pot).toEqual({
      total: 100_000,
      people: 4,
      manager: 'Andi',
      typed: false,
    });
  });
});
