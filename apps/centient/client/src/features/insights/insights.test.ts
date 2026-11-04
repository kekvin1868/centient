import { describe, expect, it } from 'vitest';
import { paginate } from './report';
import {
  exportName,
  comparisonLine,
  periodLabel,
  savingsView,
  shareLabel,
  trendBars,
  weekdayBars,
  weekdayReadout,
  counted,
  merchantKey,
} from './insights';

const oct = (spending: number, basis: 'SAME_DAYS' | 'FULL' = 'SAME_DAYS') => ({
  year: 2026,
  month: 10,
  spending,
  basis,
});

describe('comparisonLine (T4.25)', () => {
  it('says more or less, with "so far" only while the period runs', () => {
    expect(comparisonLine(1_402_500, oct(1_000_000), 'IDR')).toBe(
      'Rp402.500 more than October so far',
    );
    expect(
      comparisonLine(
        1_800_000,
        { year: 2026, month: 9, spending: 3_000_000, basis: 'FULL' },
        'IDR',
      ),
    ).toBe('Rp1.200.000 less than September');
  });
  it('equal, nothing before, and a year', () => {
    expect(comparisonLine(5, oct(5), 'IDR')).toBe('The same as October so far');
    expect(comparisonLine(5, oct(0), 'IDR')).toBe('Nothing to compare with yet');
    expect(
      comparisonLine(2_500, { year: 2025, month: null, spending: 1_000, basis: 'FULL' }, 'USD'),
    ).toBe('USD 15.00 more than 2025');
  });
});

describe('labels', () => {
  it('names a cycle by its month and a year by itself', () => {
    expect(periodLabel({ year: 2026, month: 11 })).toBe('Nov 2026 cycle');
    expect(periodLabel({ year: 2026, month: null })).toBe('2026');
  });
  it('T4.36 shares are whole percents, <1% when they round to 0, none without spending', () => {
    expect(shareLabel(800_000, 1_402_500)).toBe('57%');
    expect(shareLabel(2_500, 1_402_500)).toBe('<1%');
    expect(shareLabel(0, 1_402_500)).toBeNull();
    expect(shareLabel(5, 0)).toBeNull();
  });
  it('savings rate: none, rounded, negative with a real minus', () => {
    expect(savingsView(null)).toEqual({ kind: 'none' });
    expect(savingsView(85.975)).toEqual({ kind: 'ok', text: '86%' });
    expect(savingsView(-50)).toEqual({ kind: 'negative', text: '−50%' });
  });
});

describe('trend bars (T5.20)', () => {
  it('labels day 1 and every 5th day of a 30-day cycle, and names each day for the readout', () => {
    const trend = Array.from({ length: 30 }, (_, n) => ({
      from: `2026-11-${String(n + 1).padStart(2, '0')}`,
      amount: n < 10 ? 1_000 : null,
    }));
    const bars = trendBars(trend, 2026, 'IDR');
    expect(bars.filter(b => b.axis).map(b => b.axis)).toEqual([
      '1',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
    ]);
    expect(bars[7].name).toBe('Sun, Nov 8');
    expect(bars[12].value).toBeNull();
  });
  it('names the cycles of a year by month', () => {
    const bars = trendBars([{ from: '2025-12-25', month: 1, amount: 0 }], 2026, 'IDR');
    expect(bars[0]).toMatchObject({ axis: 'Jan', name: 'Jan 2026' });
  });
});

describe('Daily average spendings readout (Q28)', () => {
  it('reads the average with the count and the total', () => {
    const [, , , , , , sun] = weekdayBars(
      Array.from({ length: 7 }, () => ({ total: 800_000, occurrences: 2, average: 400_000 })),
      'IDR',
    );
    expect(weekdayReadout(sun, 'IDR')).toBe(
      'Sundays · Rp400.000 on average (2 Sundays, Rp800.000 in total)',
    );
    const one = weekdayBars([{ total: 5, occurrences: 1, average: 5 }], 'IDR')[0];
    expect(weekdayReadout(one, 'IDR')).toContain('(1 Monday,');
  });
});

describe('counted amounts (T5.32)', () => {
  const idr = () => true;
  const food = (t: { category_id: string | null }) => t.category_id === 'food';
  it('a split bill counts my share and lists every share', () => {
    const e = {
      command: { type: 'EXPENSE', amount: 300_000, split: { people: 3 } },
      transactions: [
        {
          type: 'EXPENSE',
          category_id: 'food',
          merchant: 'warung',
          allocations: [{ envelope_id: 'm', amount: -100_000 }],
        },
        {
          type: 'TRANSFER',
          category_id: null,
          merchant: 'warung',
          allocations: [
            { envelope_id: 'm', amount: -200_000 },
            { envelope_id: 'f', amount: 200_000 },
          ],
        },
      ],
    };
    expect(counted(e, food, idr)).toEqual({
      amount: 100_000,
      lines: [
        { label: 'bill, split with 3', amount: 300_000 },
        { label: 'You', amount: 100_000, counted: true },
        { label: 'Person 2', amount: 100_000 },
        { label: 'Person 3', amount: 100_000 },
      ],
    });
  });
  it('a transfer counts only its fee', () => {
    const e = {
      command: { type: 'TRANSFER', amount: 1_000_000, fee: 2_500 },
      transactions: [
        {
          type: 'TRANSFER',
          category_id: null,
          merchant: null,
          allocations: [
            { envelope_id: 'm', amount: -1_000_000 },
            { envelope_id: 'd', amount: 1_000_000 },
          ],
        },
        {
          type: 'EXPENSE',
          category_id: 'fees',
          merchant: null,
          allocations: [{ envelope_id: 'm', amount: -2_500 }],
        },
      ],
    };
    expect(counted(e, t => t.category_id === 'fees', idr)).toEqual({
      amount: 2_500,
      lines: [
        { label: 'transfer', amount: 1_000_000 },
        { label: 'fee', amount: 2_500, counted: true },
      ],
    });
  });
  it('a plain expense is its amount, in the currency asked only', () => {
    const e = {
      command: { type: 'EXPENSE', amount: 50_000 },
      transactions: [
        {
          type: 'EXPENSE',
          category_id: 'food',
          merchant: null,
          allocations: [{ envelope_id: 'usd', amount: -50_000 }],
        },
      ],
    };
    expect(counted(e, food, idr)).toEqual({ amount: 50_000, lines: [] });
    expect(counted(e, food, id => id !== 'usd').amount).toBe(0);
  });
  it('groups merchant names like the server', () =>
    expect(merchantKey(' Indomaret ')).toBe('indomaret'));
});

describe('exportName (T7.9)', () => {
  it('names the file by period and currency', () => {
    expect(exportName({ year: 2026, month: 11 }, 'IDR', 'csv')).toBe('centient-2026-11-IDR.csv');
    expect(exportName({ year: 2026, month: 11 }, null, 'csv')).toBe('centient-2026-11-all.csv');
    expect(exportName({ year: 2026, month: null }, 'IDR', 'csv')).toBe('centient-2026-IDR.csv');
    expect(exportName({ year: 2026, month: 3 }, 'USD', 'pdf')).toBe('centient-2026-03-USD.pdf');
  });
});

describe('paginate (Q43)', () => {
  it('packs sections in order and moves one that does not fit whole to the next page', () => {
    // Page 1 has 1000 under the title, later pages 1200; 20 between sections.
    expect(paginate([400, 500, 300, 800], 1000, 1200, 20)).toEqual([
      { page: 0, y: 0, h: 400 },
      { page: 0, y: 420, h: 500 },
      { page: 1, y: 0, h: 300 },
      { page: 1, y: 320, h: 800 },
    ]);
  });
  it('shrinks a section taller than a whole page to fit it', () => {
    expect(paginate([100, 1500], 1000, 1200, 20)).toEqual([
      { page: 0, y: 0, h: 100 },
      { page: 1, y: 0, h: 1200 },
    ]);
    expect(paginate([1500], 1000, 1200, 20)).toEqual([{ page: 0, y: 0, h: 1000 }]);
  });
});

describe('counted amounts with named people (T14, T16)', () => {
  const idr = () => true;
  const food = (t: { category_id: string | null }) => t.category_id === 'food';
  const bill = (command: Parameters<typeof counted>[0]['command'], mine: number) => ({
    command,
    transactions: [
      {
        type: 'EXPENSE',
        category_id: 'food',
        merchant: 'Kado',
        allocations: [{ envelope_id: 'm', amount: -mine }],
      },
    ],
  });

  it('lists each person by their current name, with the stickers of a renamed one', () => {
    const e = bill(
      {
        type: 'EXPENSE',
        amount: 100_000,
        split: {
          people: 3,
          parties: [{ iouAccountId: 'a', share: 10_000 }, { share: 50_000 }],
        },
      },
      40_000,
    );
    const tab = (id: string) =>
      id === 'a' ? { name: 'Obang', stickers: ['was Abang'] } : undefined;
    expect(counted(e, food, idr, tab)).toEqual({
      amount: 40_000,
      lines: [
        { label: 'bill, split with 3', amount: 100_000 },
        { label: 'You', amount: 40_000, counted: true },
        { label: 'Obang', amount: 10_000, stickers: ['was Abang'] },
        { label: 'Person 3', amount: 50_000 },
      ],
    });
  });

  it('a pot someone else runs shows the pot and my share', () => {
    const e = bill(
      { type: 'EXPENSE', amount: 25_000, pot: { total: 100_000, people: 4, manager: 'Andi' } },
      25_000,
    );
    expect(counted(e, food, idr).lines).toEqual([
      { label: 'pot, 4 people, run by Andi', amount: 100_000 },
      { label: 'You', amount: 25_000, counted: true },
    ]);
  });
});

describe('a share I covered from another account', () => {
  it('shows the whole bill and the cover, but counts only my share here', () => {
    const e = {
      transactions: [],
      command: {
        type: 'EXPENSE',
        amount: 260_000,
        split: {
          people: 3,
          parties: [
            {
              iouAccountId: 'andi',
              share: 60_000,
              covered: { amount: 40_000, accountId: 'gopay' },
            },
            { iouAccountId: 'budi', share: 100_000 },
          ],
        },
      },
    };
    const names: Record<string, string> = { andi: 'Andi', budi: 'Budi', gopay: 'GoPay' };
    const { lines } = counted(
      e,
      () => true,
      () => true,
      id => ({ name: names[id], stickers: [] }),
    );
    expect(lines.map(l => [l.label, l.amount, l.counted ?? false])).toEqual([
      ['bill, split with 3', 300_000, false],
      ['You', 100_000, true],
      ['You cover Andi (GoPay)', 40_000, false],
      ['Andi', 60_000, false],
      ['Budi', 100_000, false],
    ]);
  });
});
