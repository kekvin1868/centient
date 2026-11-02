import { describe, expect, it } from 'vitest';
import { comparisonLine, periodLabel, savingsView, shareLabel } from './insights';

const oct = (spending: number, basis: 'SAME_DAYS' | 'FULL' = 'SAME_DAYS') => ({ year: 2026, month: 10, spending, basis });

describe('comparisonLine (T4.25)', () => {
  it('says more or less, with "so far" only while the period runs', () => {
    expect(comparisonLine(1_402_500, oct(1_000_000), 'IDR')).toBe('Rp402.500 more than October so far');
    expect(comparisonLine(1_800_000, { year: 2026, month: 9, spending: 3_000_000, basis: 'FULL' }, 'IDR')).toBe('Rp1.200.000 less than September');
  });
  it('equal, nothing before, and a year', () => {
    expect(comparisonLine(5, oct(5), 'IDR')).toBe('The same as October so far');
    expect(comparisonLine(5, oct(0), 'IDR')).toBe('Nothing to compare with yet');
    expect(comparisonLine(2_500, { year: 2025, month: null, spending: 1_000, basis: 'FULL' }, 'USD')).toBe('USD 15.00 more than 2025');
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
