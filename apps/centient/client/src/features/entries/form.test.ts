import { parseQuickAdd, type QAContext } from '@centient/quickadd';
import { describe, expect, it } from 'vitest';
import { chipView, fromCommand, fromDraft, toCommand } from './form';

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
const item = (text: string, c: QAContext = ctx) => fromDraft(parseQuickAdd(text, c)[0], '0', 'friends');

describe('chipView', () => {
  it('is ready when everything resolved', () => {
    const i = item('kopi 25rb gopay');
    expect(chipView(i)).toEqual({ state: 'ready' });
    expect(toCommand(i.form)).toEqual({ command: expect.objectContaining({ type: 'EXPENSE', accountId: 'gopay', categoryId: 'food', amount: 25000 }) });
  });

  it('asks which amount for a bare number, then is ready once picked', () => {
    const i = item('makan 100 bagi 3');
    expect(chipView(i)).toMatchObject({ state: 'ask', ask: 'amount' });
    const picked = { ...i, askAmount: false, form: { ...i.form, amount: 100000 } };
    expect(chipView(picked)).toEqual({ state: 'ready' });
    expect(toCommand(picked.form)).toMatchObject({ command: { split: { people: 3, iouAccountId: 'friends' } } });
  });

  it('asks for the charged rupiah on a foreign price', () => {
    const v = chipView(item('lunch 20 usd bca'));
    expect(v).toMatchObject({ state: 'ask', ask: 'charged' });
    expect(v.state === 'ask' && v.question).toContain('USD 20.00');
  });

  it('asks which account when none is known', () => {
    expect(chipView(item('kopi 25rb', { ...ctx, lastAccountId: null }))).toMatchObject({ state: 'ask', ask: 'account' });
  });

  it('needs the form when the category is unknown', () => {
    expect(chipView(item('sesuatu 50rb'))).toEqual({ state: 'incomplete', missing: 'Pick a category' });
  });
});

describe('toCommand / fromCommand', () => {
  it('round-trips a transfer with a fee and rejects the same account twice', () => {
    const cmd = { type: 'TRANSFER' as const, fromAccountId: 'bca', toAccountId: 'gopay', amount: 100000, fee: 2500, date: '2026-10-20' };
    expect(toCommand(fromCommand(cmd))).toEqual({ command: { ...cmd, note: undefined } });
    expect(toCommand({ ...fromCommand(cmd), toAccountId: 'bca' })).toEqual({ error: 'Pick two different accounts' });
  });

  it('needs an amount', () => {
    expect(toCommand({ ...fromCommand({ type: 'INCOME', accountId: 'bca', categoryId: 'x', amount: 1, date: '2026-10-20' }), amount: null }))
      .toEqual({ error: 'Enter an amount' });
  });
});
