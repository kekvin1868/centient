import { describe, expect, it } from 'vitest';
import { barScale, describeSeries } from './chartScale';

describe('barScale (T4.26)', () => {
  it('fills the plot with the largest value, keeps 0 as a baseline, clamps negatives', () => {
    expect(barScale([800, 400, 0])).toEqual([1, 0.5, 0]);
    expect(barScale([-5, 10])).toEqual([0, 1]);
  });
  it('returns the empty state when everything is 0', () => {
    expect(barScale([0, 0])).toBeNull();
    expect(barScale([])).toBeNull();
  });
});

describe('describeSeries (T4.27)', () => {
  const p = (label: string, value: number) => ({ label, value, shown: `Rp${value}` });
  it('names the highest and the lowest', () => {
    expect(describeSeries('Spending by category', [p('Food', 550), p('Shopping', 800), p('Fees', 2)]))
      .toBe('Spending by category: highest Shopping (Rp800), lowest Fees (Rp2).');
  });
  it('one point, or nothing', () => {
    expect(describeSeries('Spending', [p('Food', 5)])).toBe('Spending: only Food (Rp5).');
    expect(describeSeries('Spending', [])).toBe('Spending: nothing yet.');
  });
});
