import { describe, expect, it } from 'vitest';
import { amountInput, evalAmount } from './amount';

describe('evalAmount', () => {
  it('multiplies and divides before adding and subtracting', () => {
    expect(evalAmount('100+20*3', 'IDR')).toBe(160);
    expect(evalAmount('100-20/4', 'IDR')).toBe(95);
    expect(evalAmount('10-4-3', 'IDR')).toBe(3);
    expect(evalAmount('100/4/5', 'IDR')).toBe(5);
  });
  it('works out brackets first', () => {
    expect(evalAmount('(100+20)*3', 'IDR')).toBe(360);
    expect(evalAmount('2*((3+4)*(1+1))', 'IDR')).toBe(28);
  });
  it('takes x × for times and : ÷ for divide, spaces anywhere', () => {
    expect(evalAmount('25.000 x 4', 'IDR')).toBe(100_000);
    expect(evalAmount('25.000×4', 'IDR')).toBe(100_000);
    expect(evalAmount('100.000 : 4', 'IDR')).toBe(25_000);
    expect(evalAmount('100.000÷4', 'IDR')).toBe(25_000);
  });
  it('reads rupiah grouping inside a sum and rounds to whole rupiah', () => {
    expect(evalAmount('1.500.000*3 + (200.000/4)', 'IDR')).toBe(4_550_000);
    expect(evalAmount('100/3', 'IDR')).toBe(33);
  });
  it('keeps decimals for other currencies', () => {
    expect(evalAmount('20.50+0.25', 'USD')).toBe(2075);
    expect(evalAmount('0.001*2', 'BTC')).toBe(200_000);
  });
  it('refuses what cannot be worked out', () => {
    for (const bad of ['', '5/0', '5-10', '-5', '(5+2', '5+2)', '5+', '*5', '5++2', '()', 'abc', '5 apples'])
      expect(evalAmount(bad, 'IDR'), bad).toBeNull();
  });
});

describe('amountInput', () => {
  it('regroups a plain rupiah amount as before', () => {
    expect(amountInput('1500000', 'IDR')).toEqual({ minor: 1_500_000, text: '1.500.000', sum: false, invalid: false });
  });
  it('keeps a sum as typed and gives its result', () => {
    expect(amountInput('1500000+5', 'IDR')).toEqual({ minor: 1_500_005, text: '1500000+5', sum: true, invalid: false });
  });
  it('marks a half-typed sum invalid', () => {
    expect(amountInput('1500000+', 'IDR')).toMatchObject({ minor: null, sum: true, invalid: true });
  });
});
