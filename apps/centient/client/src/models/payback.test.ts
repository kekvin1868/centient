import { describe, expect, it } from 'vitest';
import { extraOf, moveCommand } from './payback';

describe('payback', () => {
  it('finds the extra only above what the tab owes', () => {
    expect(extraOf(200_000, 447_000)).toBe(0);
    expect(extraOf(447_000, 447_000)).toBe(0);
    expect(extraOf(500_000, 447_000)).toBe(53_000);
    expect(extraOf(10_000, -47_000)).toBe(10_000); // nothing owed: all of it is extra
    expect(extraOf(null, 447_000)).toBe(0);
  });
  it('moves out of the tab for Paid back, into it for Return money', () => {
    const i = { tabId: 'tab', accountId: 'bank', pocket: 'food', amount: 5, date: '2026-11-09' };
    expect(moveCommand('PAID', i)).toMatchObject({
      fromAccountId: 'tab',
      toAccountId: 'bank',
      toEnvelopeId: 'food',
    });
    expect(moveCommand('RETURN', i)).toMatchObject({
      fromAccountId: 'bank',
      fromEnvelopeId: 'food',
      toAccountId: 'tab',
    });
  });
  it('keeps a gift inside the payback, never on Return money', () => {
    const i = {
      tabId: 'tab',
      accountId: 'bank',
      pocket: null,
      amount: 30,
      date: '2026-11-09',
      gift: 5,
    };
    expect(moveCommand('PAID', i)).toMatchObject({ amount: 30, gift: 5 });
    expect((moveCommand('PAID', { ...i, gift: 0 }) as { gift?: number }).gift).toBeUndefined();
    expect((moveCommand('RETURN', i) as { gift?: number }).gift).toBeUndefined();
  });
});
