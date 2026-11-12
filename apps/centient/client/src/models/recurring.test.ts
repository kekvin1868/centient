// The bill form's rules and how due dates read (pure; no network).
import { describe, expect, it } from 'vitest';
import {
  comingUp,
  dueByDay,
  dueWords,
  formFrom,
  repeatWords,
  toEvery,
  toRequest,
  validate,
  type Recurring,
} from './recurring';

const bill = (o: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  name: 'Netflix',
  accountId: 'bca',
  envelopeId: null,
  categoryId: 'fun',
  currency: 'IDR',
  amount: 120_000,
  everyMonths: 1,
  nextDue: '2026-11-20',
  endsOn: null,
  service: 'netflix',
  paused: false,
  dues: ['2026-11-20', '2026-12-20'],
  ...o,
});

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

describe('due dates on screen', () => {
  it('words a due date from today', () => {
    expect(dueWords('2026-11-12', '2026-11-12')).toBe('Due today');
    expect(dueWords('2026-11-13', '2026-11-12')).toBe('Due tomorrow');
    expect(dueWords('2026-11-20', '2026-11-12')).toBe('Due in 8 days');
    expect(dueWords('2026-11-11', '2026-11-12')).toBe('1 day late');
    expect(dueWords('2026-11-09', '2026-11-12')).toBe('3 days late');
  });

  it('lists what is coming up: soon or late, not paused, cards with money left', () => {
    const card = {
      accountId: 'card',
      cutOff: '2026-10-20',
      dueOn: '2026-11-15',
      bill: 1_000_000,
      left: 600_000,
      spentSince: 0,
    };
    const list = {
      today: '2026-11-12',
      totals: [],
      items: [
        bill({ id: 'soon', nextDue: '2026-11-19' }),
        bill({ id: 'late', nextDue: '2026-11-10' }),
        bill({ id: 'far', nextDue: '2026-11-20' }),
        bill({ id: 'paused', nextDue: '2026-11-13', paused: true }),
      ],
      cards: [
        card,
        { ...card, accountId: 'paid', left: 0 },
        { ...card, accountId: 'nodue', dueOn: null },
      ],
    };
    expect(comingUp(list).map(u => u.key)).toEqual([
      'recurring:late',
      'card:card',
      'recurring:soon',
    ]);
  });

  it('groups bills by the day they fall due', () => {
    const byDay = dueByDay([bill(), bill({ id: 'r2', name: 'Spotify', dues: ['2026-11-20'] })]);
    expect(byDay.get('2026-11-20')?.map(b => b.name)).toEqual(['Netflix', 'Spotify']);
    expect(byDay.get('2026-12-20')?.map(b => b.name)).toEqual(['Netflix']);
    expect(byDay.get('2026-11-21')).toBeUndefined();
  });
});
