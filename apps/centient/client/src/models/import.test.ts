// Reading a spreadsheet for import: which column is what, dates, amounts, and what gets skipped (pure).
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/csv';
import {
  guessDayOrder,
  guessMapping,
  needsPlain,
  parseMoney,
  toRows,
  type ImportOptions,
} from './import';

const options: ImportOptions = {
  accountId: 'bca',
  currency: 'IDR',
  order: 'DMY',
  plain: 'out',
  categories: [
    { id: 'food', name: 'Food & Drink', kind: 'EXPENSE' },
    { id: 'salary', name: 'Salary', kind: 'INCOME' },
  ],
};

describe('guessing the columns', () => {
  it("reads this app's own export", () => {
    expect(
      guessMapping('date,type,account,amount,currency,envelope,category,merchant,note'.split(',')),
    ).toEqual({ date: 0, amount: 3, income: null, type: 1, merchant: 7, note: 8, category: 6 });
  });

  it('reads an Indonesian bank sheet with debit and credit columns', () => {
    expect(guessMapping(['Tanggal', 'Keterangan', 'Debit', 'Kredit', 'Saldo'])).toEqual({
      date: 0,
      amount: 2,
      income: 3,
      type: null,
      merchant: 1,
      note: null,
      category: null,
    });
  });

  it('leaves what it cannot find empty', () => {
    expect(guessMapping(['A', 'B'])).toMatchObject({ date: null, amount: null });
  });
});

describe('dates', () => {
  it('takes month-first only when the dates prove it', () => {
    expect(guessDayOrder(['11/10/2026', '11/25/2026'])).toBe('MDY');
    expect(guessDayOrder(['25/11/2026', '10/11/2026'])).toBe('DMY');
    expect(guessDayOrder(['10/11/2026'])).toBe('DMY');
    expect(guessDayOrder(['2026-11-10'])).toBe('DMY');
  });
});

describe('amounts', () => {
  it('reads grouping either way, currency words and the ways to write a minus', () => {
    expect(parseMoney('25000', 'IDR')).toBe(25_000);
    expect(parseMoney('Rp 25.000', 'IDR')).toBe(25_000);
    expect(parseMoney('25.000,00', 'IDR')).toBe(25_000);
    expect(parseMoney('-25,000.00', 'IDR')).toBe(-25_000);
    expect(parseMoney('(25000)', 'IDR')).toBe(-25_000);
    expect(parseMoney('25000-', 'IDR')).toBe(-25_000);
    expect(parseMoney('USD 20.50', 'USD')).toBe(2050);
    expect(parseMoney('', 'IDR')).toBeNull();
    expect(parseMoney('n/a', 'IDR')).toBeNull();
  });
});

describe('rows from a file', () => {
  const read = (csv: string, o: Partial<ImportOptions> = {}) => {
    const [headers, ...table] = parseCsv(csv);
    return toRows(table, guessMapping(headers), { ...options, ...o });
  };

  it('takes the sign from a minus, a type column, a money-in column or the picked default', () => {
    expect(
      read('date,amount\n2026-11-10,-25000\n2026-11-11,9500000').rows.map(r => r.amount),
    ).toEqual([-25_000, -9_500_000]);
    expect(read('date,amount\n2026-11-11,9500000', { plain: 'in' }).rows[0].amount).toBe(9_500_000);
    expect(
      read(
        'Date,Income/Expense,Amount\n10/11/2026,Expense,25000\n11/11/2026,Income,9500000',
      ).rows.map(r => r.amount),
    ).toEqual([-25_000, 9_500_000]);
    expect(
      read(
        'Tanggal;Keterangan;Debit;Kredit\n10/11/2026;QRIS KOPI;25.000,00;0\n11/11/2026;GAJI;0;9.500.000,00',
      ).rows,
    ).toEqual([
      { date: '2026-11-10', amount: -25_000, merchant: 'QRIS KOPI', accountId: 'bca' },
      { date: '2026-11-11', amount: 9_500_000, merchant: 'GAJI', accountId: 'bca' },
    ]);
  });

  it('matches a category by name and kind, and carries the note', () => {
    const { rows } = read(
      'date,amount,category,merchant,note\n2026-11-10,-25000,food & drink,Kopi,with Andi\n2026-11-10,-1000,Salary,x,',
    );
    expect(rows[0]).toEqual({
      date: '2026-11-10',
      amount: -25_000,
      merchant: 'Kopi',
      note: 'with Andi',
      accountId: 'bca',
      categoryId: 'food',
    });
    expect(rows[1].categoryId).toBeUndefined();
  });

  it('skips moves, bad dates and empty amounts, naming the line', () => {
    const r = read(
      'date,type,amount\n2026-11-10,TRANSFER,-5000\nsoon,EXPENSE,-1\n2026-11-10,EXPENSE,\n2026-11-10,EXPENSE,-7000',
    );
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toEqual([
      { line: 2, why: 'a move between accounts' },
      { line: 3, why: 'no date in "soon"' },
      { line: 4, why: 'no amount in ""' },
    ]);
  });

  it('knows when the file does not say which way money went', () => {
    const table = [['2026-11-10', '25000']];
    const map = guessMapping(['date', 'amount']);
    expect(needsPlain(table, map, 'IDR')).toBe(true);
    expect(needsPlain([['2026-11-10', '-25000']], map, 'IDR')).toBe(false);
    expect(needsPlain(table, guessMapping(['date', 'amount', 'type']), 'IDR')).toBe(false);
  });
});
