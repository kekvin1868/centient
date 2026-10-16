import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, parseNumber, toMinor } from './index';

describe('parseNumber', () => {
  it.each([
    ['52.500', 52500], ['25,000', 25000], ['1.500.000', 1500000], ['52.500,00', 52500],
    ['1,5', 1.5], ['1.5', 1.5], ['1234', 1234], ['100', 100],
  ])('%s -> %s', (s, n) => expect(parseNumber(s)).toBe(n));

  it('rejects malformed numbers', () => expect(parseNumber('1.2.3')).toBeNull());
});

describe('parseAmount', () => {
  it.each([
    ['25rb', 25000], ['25Rb', 25000], ['25RB', 25000], ['25k', 25000], ['25K', 25000],
    ['25ribu', 25000], ['1jt', 1000000], ['1,5jt', 1500000], ['1.5juta', 1500000],
    ['Rp52.500', 52500], ['rp. 52.500', 52500], ['Rp. 25,000', 25000], ['IDR 15000', 15000],
    ['2000', 2000], ['Rp100', 100],
  ])('%s -> exact %s', (t, v) => expect(parseAmount(t)).toEqual({ kind: 'exact', value: v }));

  it('infers a bare small number', () =>
    expect(parseAmount('100')).toEqual({ kind: 'inferred', candidates: [100, 100000, 100000000] }));

  it('never guesses M', () => expect(parseAmount('2m')).toEqual({ kind: 'ambiguous_m', value: 2 }));

  it('ignores words', () => expect(parseAmount('kopi')).toBeNull());
});

describe('formatMoney', () => {
  it('formats rupiah and other currencies', () => {
    expect(formatMoney(52500)).toBe('Rp52,500');
    expect(formatMoney(-1000)).toBe('-Rp1,000');
    expect(formatMoney(1050, 'USD')).toBe('USD 10.50');
    expect(toMinor(10.5, 'USD')).toBe(1050);
  });
});
