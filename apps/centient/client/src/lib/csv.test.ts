import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows, Windows line ends and a byte order mark', () => {
    expect(parseCsv('﻿date,amount\r\n2026-11-10,25000\r\n')).toEqual([
      ['date', 'amount'],
      ['2026-11-10', '25000'],
    ]);
  });

  it('keeps separators, quotes and line breaks inside quoted cells', () => {
    expect(parseCsv('note,amount\n"Kopi, susu","1,5"\n"He said ""ok""",2\n"two\nlines",3')).toEqual(
      [
        ['note', 'amount'],
        ['Kopi, susu', '1,5'],
        ['He said "ok"', '2'],
        ['two\nlines', '3'],
      ],
    );
  });

  it('picks the separator the first line uses: semicolon or tab', () => {
    expect(parseCsv('Tanggal;Jumlah\n10/11/2026;25.000,00')).toEqual([
      ['Tanggal', 'Jumlah'],
      ['10/11/2026', '25.000,00'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('drops blank lines, keeps empty cells and trims', () => {
    expect(parseCsv('a,b,c\n\n 1 ,,3\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});
