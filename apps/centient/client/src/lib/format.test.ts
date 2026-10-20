import { describe, expect, it } from 'vitest';
import { dayLabel, formatMoney } from './format';

describe('formatMoney', () => {
  it('formats rupiah the Indonesian way', () => {
    expect(formatMoney(25000)).toBe('Rp25.000');
    expect(formatMoney(1250000)).toBe('Rp1.250.000');
    expect(formatMoney(-52500)).toBe('-Rp52.500');
    expect(formatMoney(0)).toBe('Rp0');
  });

  it('keeps decimals for other currencies', () => {
    expect(formatMoney(2050, 'USD')).toBe('USD 20.50');
    expect(formatMoney(100_000, 'BTC')).toBe('BTC 0.001');
  });
});

describe('dayLabel', () => {
  it('names recent days', () => {
    expect(dayLabel('2026-10-20', '2026-10-20')).toBe('Today');
    expect(dayLabel('2026-10-19', '2026-10-20')).toBe('Yesterday');
    expect(dayLabel('2026-10-12', '2026-10-20')).toBe('Mon 12 Oct');
  });
});
