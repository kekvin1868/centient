import { describe, expect, it } from 'vitest';
import src from './HomeBudgets.tsx?raw';
import { accountBudgets, hpTone } from './HomeBudgets';
import type { Budget } from '../../models/budget';

const b = (id: string, envelopeId: string | null, extra: Partial<Budget> = {}) =>
  ({ id, envelopeId, categoryId: 'food', currency: 'IDR', startsOn: null, ...extra }) as Budget;

describe('HomeBudgets', () => {
  it("keeps only the account's pocket budgets in its currency, cycle ones first", () => {
    const pockets = [
      { id: 'main:a', account_id: 'a' },
      { id: 'trip:a', account_id: 'a' },
      { id: 'main:b', account_id: 'b' },
    ];
    const all = [
      b('temp', 'trip:a', { startsOn: '2026-11-01' }),
      b('food', 'main:a'),
      b('other', 'main:b'),
      b('catOnly', null),
      b('usd', 'main:a', { currency: 'USD' }),
    ];
    expect(accountBudgets(all, pockets, { id: 'a', currency_code: 'IDR' }).map(x => x.id)).toEqual([
      'food',
      'temp',
    ]);
  });
  it('drains green, then yellow, then red', () => {
    expect([hpTone(80, 100), hpTone(40, 100), hpTone(10, 100), hpTone(-5, 100)]).toEqual([
      'green',
      'yellow',
      'red',
      'red',
    ]);
  });
  it('brings no colours of its own', () => expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i));
});
