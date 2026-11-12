import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QAContext } from './index';
import { resolveSums } from './sums';

describe('resolveSums', () => {
  it('dividing is only maths, never a split', () => {
    expect(resolveSums('Makan Dimsum 19k/3=')).toBe('Makan Dimsum 6.333');
    expect(resolveSums('kado (50rb+40rb)/3=')).toBe('kado 30.000');
    expect(resolveSums('makan 86rb / 2 =')).toBe('makan 43.000');
  });
  it('sums are written in full', () => {
    expect(resolveSums('25rb+18rb=')).toBe('43.000');
    expect(resolveSums('kopi 100rb÷3= gopay')).toBe('kopi 33.333 gopay');
    expect(resolveSums('bensin 100rb:4=')).toBe('bensin 25.000');
    expect(resolveSums('laptop 1,5jt*2=')).toBe('laptop 3.000.000');
    expect(resolveSums('2x15rb=, grab 18k')).toBe('30.000, grab 18k');
  });
  it('leaves what cannot be worked out, and lines with no =', () => {
    for (const line of ['kopi 5/0=', 'kopi (5+2=', 'kopi 25rb', 'kopi 19k/3', 'abc19k='])
      expect(resolveSums(line)).toBe(line);
  });
});

describe('parseQuickAdd with a sum', () => {
  const ctx: QAContext = {
    today: '2026-11-06',
    accounts: [
      { id: 'a', name: 'Main', kind: 'BANK', provider: null, currency_code: 'IDR' },
    ] as never,
    categories: [{ id: 'food', name: 'Food & Drink', kind: 'EXPENSE' }],
  };
  it('19k/3= is 6.333 with no split', () => {
    expect(parseQuickAdd('Makan Dimsum 19k/3=', ctx)[0]).toMatchObject({
      amount: 6_333,
      split: null,
    });
  });
  it('25rb+18rb= is 43.000', () => {
    expect(parseQuickAdd('kopi 25rb+18rb=', ctx)[0]).toMatchObject({ amount: 43_000, split: null });
  });
});
