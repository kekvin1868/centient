// The bill form's rules (pure; no network).
import { describe, expect, it } from 'vitest';
import { bill } from './recurring.fixture';
import { formFrom, repeatWords, toEvery, toRequest, validate } from './recurringForm';

describe('the bill form', () => {
  it('starts empty, from a found payment, or from a saved bill', () => {
    expect(formFrom(null, '2026-11-12')).toMatchObject({
      name: '',
      amount: null,
      varies: false,
      everyMonths: 1,
      nextDue: '2026-11-12',
      endsOn: '',
    });
    expect(formFrom(null, '2026-11-12', { name: 'Spotify', amount: 54_990 })).toMatchObject({
      name: 'Spotify',
      amount: 54_990,
    });
    expect(formFrom(bill({ amount: null, everyMonths: 12 }), '2026-11-12')).toMatchObject({
      name: 'Netflix',
      varies: true,
      everyMonths: 12,
      nextDue: '2026-11-20',
    });
  });

  it('names the first thing missing', () => {
    const f = formFrom(bill(), '2026-11-12');
    expect(validate(f)).toBeNull();
    expect(validate({ ...f, name: '  ' })).toBe('Give it a name');
    expect(validate({ ...f, accountId: null })).toBe('Pick where it is paid from');
    expect(validate({ ...f, categoryId: null })).toBe('Pick a category');
    expect(validate({ ...f, amount: null })).toBe('Enter the amount');
    expect(validate({ ...f, amount: null, varies: true })).toBeNull();
    expect(validate({ ...f, endsOn: '2026-11-19' })).toBe('It ends before it is next due');
  });

  it('sends no amount for a bill that varies and no end for an empty one', () => {
    const f = formFrom(bill(), '2026-11-12');
    expect(toRequest({ ...f, name: ' Netflix ', varies: true })).toEqual({
      name: 'Netflix',
      service: 'netflix',
      accountId: 'bca',
      envelopeId: null,
      categoryId: 'fun',
      amount: null,
      everyMonths: 1,
      nextDue: '2026-11-20',
      endsOn: null,
    });
    expect(toRequest({ ...f, endsOn: '2027-01-20' }).endsOn).toBe('2027-01-20');
  });

  it('reads how often it repeats', () => {
    expect(toEvery(3)).toBe(3);
    expect(toEvery(2)).toBe(1);
    expect(repeatWords(12)).toBe('Every year');
  });
});
