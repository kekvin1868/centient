// The Bills page's rows, month run and list groups (pure; no network).
import { describe, expect, it } from 'vitest';
import { billGroups, monthRun, paidLate, rowsByDay, rowsOf } from './billRun';
import { bill } from './recurring.fixture';

const today = '2026-11-15';
const pay = (due: string, paidOn = due, amount = 120_000) => ({
  due,
  paidOn,
  amount,
  entryId: `e:${due}`,
});

describe('bill rows', () => {
  it('turns payments and open due dates into rows', () => {
    const rows = rowsOf(
      bill({
        nextDue: '2026-11-10',
        dues: ['2026-11-10', '2026-12-10'],
        payments: [pay('2026-10-10', '2026-10-12')],
      }),
      today,
    );
    expect(rows.map(r => [r.due, r.state])).toEqual([
      ['2026-10-10', 'paid'],
      ['2026-11-10', 'late'],
      ['2026-12-10', 'due'],
    ]);
    expect(paidLate(rows[0])).toBe(true);
    expect(paidLate(rows[1])).toBe(false);
  });

  it('guesses a varying bill from its last payment', () => {
    const varies = bill({ amount: null, payments: [pay('2026-10-20', '2026-10-20', 412_300)] });
    expect(rowsOf(varies, today).at(-1)).toMatchObject({ amount: 412_300, guess: true });
    expect(rowsOf(bill({ amount: null }), today)[0]).toMatchObject({ amount: null, guess: true });
  });

  it('marks the calendar by due date', () => {
    const byDay = rowsByDay([bill(), bill({ id: 'r2', dues: ['2026-11-20'] })], today);
    expect(byDay.get('2026-11-20')?.map(r => r.item.id)).toEqual(['r1', 'r2']);
    expect(byDay.get('2026-12-20')?.length).toBe(1);
  });
});

describe('the month run', () => {
  it('counts what this month asks for and what is left', () => {
    const [run] = monthRun(
      [
        bill({ id: 'paid', dues: ['2026-12-03'], payments: [pay('2026-11-03')] }),
        bill({ id: 'late', amount: 50_000, dues: ['2026-11-12', '2026-12-12'] }),
        bill({ id: 'soon', amount: 30_000, dues: ['2026-11-20'] }),
        bill({ id: 'next-month', dues: ['2026-12-01'] }),
        bill({ id: 'paused', paused: true, dues: [] }),
        bill({ id: 'varies', amount: null, dues: ['2026-11-25'] }),
      ],
      today,
    );
    expect(run).toEqual({
      currency: 'IDR',
      total: 200_000,
      left: 80_000,
      paid: 1,
      count: 4,
      late: 1,
      latePaid: 0,
      unknown: 1,
    });
  });

  it('keeps arrears in the run, also once they are paid this month', () => {
    const open = bill({ dues: ['2026-10-20', '2026-11-20'] });
    expect(monthRun([open], today)[0]).toMatchObject({ count: 2, left: 240_000, late: 1 });
    const caughtUp = bill({ dues: ['2026-11-20'], payments: [pay('2026-10-20', '2026-11-02')] });
    expect(monthRun([caughtUp], today)[0]).toMatchObject({
      count: 2,
      paid: 1,
      latePaid: 1,
      left: 120_000,
    });
    const lastMonth = bill({ dues: ['2026-11-20'], payments: [pay('2026-10-20')] });
    expect(monthRun([lastMonth], today)[0]).toMatchObject({ count: 1, paid: 0 });
  });

  it('keeps currencies apart', () => {
    const runs = monthRun([bill(), bill({ id: 'usd', currency: 'USD', amount: 999 })], today);
    expect(runs.map(r => [r.currency, r.left])).toEqual([
      ['IDR', 120_000],
      ['USD', 999],
    ]);
  });
});

describe('the list', () => {
  it('shows every bill once, in its group', () => {
    const groups = billGroups(
      [
        bill({ id: 'paid', dues: ['2026-12-03'], payments: [pay('2026-11-03')] }),
        bill({ id: 'late', dues: ['2026-11-12'] }),
        bill({ id: 'soon', dues: ['2026-11-22'] }),
        bill({ id: 'later', dues: ['2026-11-23'] }),
        // Paid this month, and the next one is already within a week: the open one wins.
        bill({ id: 'again', dues: ['2026-11-18'], payments: [pay('2026-11-04')] }),
        bill({ id: 'paused', paused: true, dues: [] }),
      ],
      today,
    );
    expect(groups.map(g => [g.label, g.rows.map(r => r.item.id)])).toEqual([
      ['Late', ['late']],
      ['Next 7 days', ['again', 'soon']],
      ['Later', ['later']],
      ['Paid', ['paid']],
      ['Paused', ['paused']],
    ]);
  });
});
