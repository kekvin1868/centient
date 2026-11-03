import { describe, expect, it } from 'vitest';
import { dayLabel, formatMoney, goalLine, shortMoney } from './format';

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
    expect(formatMoney(1500, 'JPY')).toBe('JPY 1,500');
    expect(formatMoney(1250, 'KWD')).toBe('KWD 1.250');
    expect(formatMoney(2000, 'EUR')).toBe('EUR 20.00');
  });
});

describe('dayLabel', () => {
  it('names recent days', () => {
    expect(dayLabel('2026-10-20', '2026-10-20')).toBe('Today');
    expect(dayLabel('2026-10-19', '2026-10-20')).toBe('Yesterday');
    expect(dayLabel('2026-10-12', '2026-10-20')).toBe('Mon 12 Oct');
  });
});

describe('shortMoney', () => {
  it('shortens rupiah the Indonesian way and leaves other currencies alone', () => {
    expect([150_000, 1_000_000, 1_788_000, 29_500_000, 2_500_000_000, -1_788_000, 950].map(v => shortMoney(v)))
      .toEqual(['Rp150rb', 'Rp1jt', 'Rp1,8jt', 'Rp29,5jt', 'Rp2,5M', '-Rp1,8jt', 'Rp950']);
    expect(shortMoney(250_000, 'BTC')).toBe('BTC 0.0025');
  });
});

describe('goalLine (T6.18)', () => {
  const g = { state: 'ON_THE_WAY', neededPerCycle: 1_400_000, cyclesLeft: 5, targetDate: '2027-03-31', currency: 'IDR' };
  it('says what to put in each cycle, by when and how many cycles are left', () => {
    expect(goalLine(g)).toBe('Rp1.400.000 a cycle · by 31 Mar 2027 (5 cycles left)');
    expect(goalLine({ ...g, cyclesLeft: 1, neededPerCycle: 7_000_000, targetDate: '2026-11-25' })).toBe('Rp7.000.000 a cycle · by 25 Nov 2026 (1 cycle left)');
  });
  it('names the state instead of a number, and has no line without a date', () => {
    expect(goalLine({ ...g, state: 'PAST_TARGET_DATE', neededPerCycle: null, cyclesLeft: null })).toBe('Past target date');
    expect(goalLine({ ...g, state: 'REACHED', neededPerCycle: null, cyclesLeft: null })).toBe('Goal reached');
    expect(goalLine({ ...g, neededPerCycle: null, cyclesLeft: null, targetDate: null })).toBeNull();
  });
});
