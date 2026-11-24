// How due dates read on screen (pure; no network).
import { describe, expect, it } from 'vitest';
import {
  afterCardBills,
  cardsOwed,
  billLines,
  comingUp,
  dueByDay,
  dueWords,
  interestSources,
  minimumState,
  paidExtra,
  nextBillName,
  statementGap,
  statementOf,
} from './recurring';
import { bill } from './recurring.fixture';

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
      paidSince: 400_000,
      spentSince: 0,
      before: null,
      interestFrom: { month: null, plans: [] },
      statement: null,
      unpaidBills: 1,
      lines: { carry: 0, spent: 0, slices: [], interest: [] },
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

  it('takes card bills left to pay and card spending since off your money', () => {
    const card = {
      accountId: 'bca',
      cutOff: '2026-11-20',
      dueOn: '2026-12-05',
      bill: 1_500_000,
      left: 1_000_000,
      paidSince: 500_000,
      spentSince: 300_000,
      before: null,
      interestFrom: { month: null, plans: [] },
      statement: null,
      unpaidBills: 1,
      lines: { carry: 0, spent: 0, slices: [], interest: [] },
    };
    const idr = (id: string) => id !== 'usd';
    expect(
      afterCardBills(
        10_000_000,
        [
          card,
          { ...card, accountId: 'paid', left: 0, spentSince: 0 },
          { ...card, accountId: 'refund', left: 0, spentSince: -50_000 },
          { ...card, accountId: 'usd' },
        ],
        idr,
      ),
    ).toBe(8_700_000);
    // Its breakdown: the cards that owe, a refund counted as nothing (not as money back).
    expect(
      cardsOwed(
        [
          card,
          { ...card, accountId: 'paid', left: 0, spentSince: 0 },
          { ...card, accountId: 'refund', left: 0, spentSince: -50_000 },
          { ...card, accountId: 'usd' },
        ],
        idr,
      ),
    ).toEqual([{ accountId: card.accountId, left: card.left, spentSince: card.spentSince }]);
    // No card owes anything: no line.
    expect(afterCardBills(10_000_000, [{ ...card, left: 0, spentSince: 0 }], idr)).toBeNull();
  });

  it("reads a card bill's lines in the bank's order, and the interest sources the server allows", () => {
    const card = {
      accountId: 'bca',
      cutOff: '2026-11-20',
      dueOn: '2026-12-05',
      bill: 1_355_000,
      left: 1_355_000,
      paidSince: 0,
      spentSince: 0,
      before: '2026-10',
      interestFrom: { month: '2026-10', plans: [{ id: 'p1', name: 'TV' }] },
      statement: null,
      unpaidBills: 1,
      lines: {
        carry: 500_000,
        spent: 700_000,
        slices: [{ planId: 'p1', name: 'TV', no: 2, of: 6, amount: 100_000, paid: false }],
        interest: [
          {
            entryId: 'e1',
            planId: null,
            no: null,
            from: '2026-10',
            day: '2026-11-20',
            amount: 45_000,
            planName: null,
          },
          {
            entryId: 'e2',
            planId: 'p1',
            no: 2,
            from: null,
            day: '2026-11-20',
            amount: 10_000,
            planName: 'TV',
          },
        ],
      },
    };
    expect(billLines(card).map(l => l.label)).toEqual([
      'Unpaid from Oct',
      'Spending',
      'TV · installment 2 of 6',
      'Interest · on unpaid Oct',
      'Interest · TV installment 2',
    ]);
    // Oct's interest is already typed on this bill: only the plan is still offered.
    expect(interestSources(card).map(s => [s.label, s.from])).toEqual([['TV', { planId: 'p1' }]]);
    expect(
      interestSources({ ...card, lines: { ...card.lines, interest: [] } }).map(s => s.label),
    ).toEqual(['On unpaid Oct', 'TV']);
    expect(interestSources({ ...card, interestFrom: { month: null, plans: [] } })).toEqual([]);
  });

  it('groups bills by the day they fall due', () => {
    const byDay = dueByDay([bill(), bill({ id: 'r2', name: 'Spotify', dues: ['2026-11-20'] })]);
    expect(byDay.get('2026-11-20')?.map(b => b.name)).toEqual(['Netflix', 'Spotify']);
    expect(byDay.get('2026-12-20')?.map(b => b.name)).toEqual(['Netflix']);
    expect(byDay.get('2026-11-21')).toBeUndefined();
  });
});

describe("the bank's statement", () => {
  const card = {
    accountId: 'bca',
    cutOff: '2026-11-20',
    dueOn: '2026-12-05',
    bill: 1_250_000,
    left: 1_250_000,
    paidSince: 0,
    spentSince: 0,
    before: null,
    interestFrom: { month: null, plans: [] },
    statement: { total: 1_250_000, minimum: 125_000 },
    unpaidBills: 1,
    lines: { carry: 0, spent: 1_250_000, slices: [], interest: [] },
  };

  it('a statement typed but not sent yet is the one shown; a refused one is not', () => {
    const item = (state: 'waiting' | 'refused') =>
      ({
        key: state,
        op: 'statement',
        entryId: 'statement:bca:2026-11-20',
        statement: { accountId: 'bca', closedOn: '2026-11-20', total: 1_300_000, minimum: null },
        at: 1,
        state,
      }) as const;
    expect(statementOf(card, [])).toEqual({ total: 1_250_000, minimum: 125_000 });
    expect(statementOf(card, [item('waiting')])).toEqual({ total: 1_300_000, minimum: null });
    expect(statementOf(card, [item('refused')])).toEqual(card.statement);
  });

  it('the gap: bank higher, app higher, or matching once typed interest is counted', () => {
    expect(statementGap({ ...card, bill: 1_200_000 }, 1_250_000)).toBe(50_000);
    expect(statementGap({ ...card, bill: 1_300_000 }, 1_250_000)).toBe(-50_000);
    expect(statementGap({ ...card, bill: 1_200_000 }, 1_250_000, 50_000)).toBe(0);
  });

  it('payments against the minimum, and where the rest carries', () => {
    const st = card.statement;
    expect(minimumState(card, st)).toBeNull(); // nothing paid yet
    expect(minimumState({ ...card, paidSince: 125_000, left: 1_125_000 }, st)).toEqual({
      kind: 'minimum',
      carries: 1_125_000,
    });
    expect(minimumState({ ...card, paidSince: 100_000, left: 1_150_000 }, st)).toEqual({
      kind: 'below',
      short: 25_000,
    });
    expect(minimumState({ ...card, paidSince: 1_250_000, left: 0 }, st)).toBeNull(); // paid in full
    expect(minimumState({ ...card, paidSince: 100_000 }, { total: 1, minimum: null })).toBeNull();
    expect(nextBillName(card)).toBe('Dec');
    expect(nextBillName({ ...card, cutOff: '2026-12-20' })).toBe('Jan');
  });
});

describe('interest already typed, and paying more than the bill', () => {
  const card = {
    accountId: 'bca',
    cutOff: '2026-11-10',
    dueOn: '2026-11-25',
    bill: 1_350_000,
    left: 0,
    paidSince: 1_400_000,
    spentSince: 0,
    before: '2026-10',
    interestFrom: { month: '2026-10', plans: [{ id: 'p1', name: 'TV' }] },
    statement: null,
    unpaidBills: 0,
    lines: {
      carry: 1_000_000,
      spent: 300_000,
      slices: [],
      interest: [
        {
          entryId: 'e1',
          planId: null,
          planName: null,
          no: null,
          from: '2026-10',
          day: '2026-11-10',
          amount: 50_000,
        },
      ],
    },
  };

  it('offers only sources with no typed line on this bill (a posted plan line does not count)', () => {
    expect(interestSources(card).map(s => s.key)).toEqual(['p:p1']);
    const posted = {
      entryId: 'e2',
      planId: 'p1',
      planName: 'TV',
      no: 1,
      from: null,
      day: '2026-11-10',
      amount: 9,
    };
    expect(
      interestSources({
        ...card,
        lines: { ...card.lines, interest: [...card.lines.interest, posted] },
      }).map(s => s.key),
    ).toEqual(['p:p1']);
  });

  it('paid extra is what went in beyond the bill', () => {
    expect(paidExtra(card)).toBe(50_000);
    expect(paidExtra({ ...card, paidSince: 400_000 })).toBe(0);
  });
});
