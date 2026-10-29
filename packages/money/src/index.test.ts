import { describe, expect, it } from 'vitest';
import { CURRENCIES, DECIMALS, formatMoney, parseAmount, parseNumber, toMinor } from './index';

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

  it.each([
    ['20usd', 2000, 'USD'], ['$20', 2000, 'USD'], ['us$20.5', 2050, 'USD'], ['usd 1,500', 150000, 'USD'],
    ['usdt50', 50_000_000, 'USDT'], ['0.001btc', 100_000, 'BTC'], ['btc 0.00012', 12_000, 'BTC'],
  ])('%s -> %s minor units of %s', (t, v, currency) => expect(parseAmount(t)).toEqual({ kind: 'exact', value: v, currency }));

  it('treats rupiah words like before and rejects mixed currencies', () => {
    expect(parseAmount('25rb')).toEqual({ kind: 'exact', value: 25000 });
    expect(parseAmount('idr 52.500')).toEqual({ kind: 'exact', value: 52500 });
    expect(parseAmount('$20btc')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats rupiah and other currencies', () => {
    expect(formatMoney(52500)).toBe('Rp52,500');
    expect(formatMoney(-1000)).toBe('-Rp1,000');
    expect(formatMoney(1050, 'USD')).toBe('USD 10.50');
    expect(toMinor(10.5, 'USD')).toBe(1050);
  });
});

describe('currency list', () => {
  it('lists the world currencies once each, with names and whole decimals', () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(CURRENCIES.map(c => c.code)).size).toBe(CURRENCIES.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3,4}$/);
      expect(c.name).not.toBe('');
      expect(Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 8).toBe(true);
    }
  });

  it('keeps ISO decimals, rupiah whole and the old four unchanged', () =>
    expect(['JPY', 'KRW', 'IDR', 'USD', 'EUR', 'KWD', 'USDT', 'BTC'].map(c => DECIMALS[c])).toEqual([0, 0, 0, 2, 2, 3, 6, 8]));

  it('converts and prints any listed currency', () => {
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(toMinor(1.25, 'KWD')).toBe(1250);
    expect(formatMoney(1500, 'JPY')).toBe('JPY 1,500');
    expect(formatMoney(1250, 'KWD')).toBe('KWD 1.250');
  });

  it('reads eur and jpy in quick add, and no other new codes', () => {
    expect(parseAmount('20jpy')).toEqual({ kind: 'exact', value: 20, currency: 'JPY' });
    expect(parseAmount('eur15')).toEqual({ kind: 'exact', value: 1500, currency: 'EUR' });
    expect(parseAmount('20usd')).toEqual({ kind: 'exact', value: 2000, currency: 'USD' });
    expect(parseAmount('20chf')).toBeNull();
  });
});
