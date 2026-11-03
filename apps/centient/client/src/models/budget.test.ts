import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/labels', () => ({ pocketLabel: (id: string) => `Pocket ${id}` }));
const { budgetCurrencies, budgetName, budgetsIn, formCurrency, formFrom, toRequest, validate } =
  await import('./budget');

const today = '2026-11-10';
const row = {
  id: 'b1',
  categoryId: 'food',
  envelopeId: null,
  currency: 'USD',
  limit: 50_000,
  spent: 0,
  remaining: 50_000,
  percent: 0,
  safePerDay: null,
  daysGone: 3,
  cycleDays: 7,
  projected: null,
  status: 'ON_TRACK' as const,
  startsOn: '2026-11-08',
  endsOn: '2026-11-15',
};

describe('budget form', () => {
  it('starts empty for a new budget: rupiah, 14 days from today', () => {
    expect(formFrom(null, today)).toEqual({
      categoryId: null,
      envelopeId: null,
      limit: null,
      currency: 'IDR',
      temporary: false,
      startsOn: today,
      days: 14,
    });
  });

  it('takes an existing temporary budget as it is', () => {
    expect(formFrom(row, today)).toMatchObject({
      categoryId: 'food',
      limit: 50_000,
      currency: 'USD',
      temporary: true,
      startsOn: '2026-11-08',
      days: 7,
    });
  });

  it('keeps a saved currency, else a pocket decides, else the pick', () => {
    const f = { ...formFrom(null, today), currency: 'JPY' };
    expect(formCurrency(f, false)).toBe('JPY');
    expect(formCurrency(f, false, 'USD')).toBe('USD');
    expect(formCurrency({ ...f, currency: 'EUR' }, true, 'USD')).toBe('EUR');
  });

  it('says what stops saving, in order', () => {
    const f = formFrom(null, today);
    const o = { editing: false, today };
    expect(validate(f, o)).toBe('Pick a category or a pocket');
    expect(validate({ ...f, envelopeId: 'p' }, o)).toBe('Enter a limit');
    const temp = { ...f, envelopeId: 'p', limit: 1, temporary: true, startsOn: '2026-11-09' };
    expect(validate(temp, o)).toBe('Start today or later');
    expect(validate(temp, { editing: true, today })).toBeNull(); // a running one keeps its start
    expect(validate({ ...temp, startsOn: today }, o)).toBeNull();
  });

  it('sends dates only for a temporary budget', () => {
    const f = { ...formFrom(null, today), categoryId: 'food', limit: 9 };
    expect(toRequest(f, 'IDR')).toEqual({
      categoryId: 'food',
      envelopeId: null,
      currency: 'IDR',
      limit: 9,
    });
    expect(toRequest({ ...f, temporary: true }, 'IDR', 'b1')).toMatchObject({
      startsOn: today,
      days: 14,
      id: 'b1',
    });
  });
});

describe('budget display', () => {
  const cat = { accounts: [], envelopes: [], categories: [{ id: 'food', name: 'Food & Drink' }] };

  it('names the category, the pocket, or both', () => {
    expect(budgetName({ categoryId: 'food', envelopeId: null }, cat as never)).toBe('Food & Drink');
    expect(budgetName({ categoryId: 'food', envelopeId: 'p' }, cat as never)).toBe(
      'Food & Drink in Pocket p',
    );
  });

  it('groups rupiah first, then by code; rupiah alone when empty', () => {
    expect(
      budgetCurrencies([{ currency: 'USD' }, { currency: 'IDR' }, { currency: 'EUR' }]),
    ).toEqual(['IDR', 'EUR', 'USD']);
    expect(budgetCurrencies([])).toEqual(['IDR']);
  });

  it('lists cycle budgets before temporary ones, in one currency', () => {
    const cycle = { ...row, id: 'c', startsOn: null, endsOn: null };
    const other = { ...row, id: 'x', currency: 'IDR' };
    expect(budgetsIn([row, other, cycle], 'USD').map(b => b.id)).toEqual(['c', 'b1']);
  });
});
