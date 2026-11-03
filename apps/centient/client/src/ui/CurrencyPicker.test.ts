import { describe, expect, it } from 'vitest';
import { searchCurrencies } from './CurrencyPicker';

describe('searchCurrencies', () => {
  it('finds currencies by name or code, codes first, at most eight', () => {
    expect(searchCurrencies('yen').map(c => c.code)).toEqual(['JPY']);
    expect(searchCurrencies('sgd').map(c => c.code)).toEqual(['SGD']);
    expect(searchCurrencies('usd')[0].code).toBe('USD');
    expect(searchCurrencies('dollar')).toHaveLength(8);
    expect(searchCurrencies('  ')).toEqual([]);
  });
});
