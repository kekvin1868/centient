import { describe, expect, it } from 'vitest';
import { barScale, describeSeries, readoutIndex, signedScale } from './chartScale';

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
    expect(
      describeSeries('Spending by category', [p('Food', 550), p('Shopping', 800), p('Fees', 2)]),
    ).toBe('Spending by category: highest Shopping (Rp800), lowest Fees (Rp2).');
  });
  it('one point, or nothing', () => {
    expect(describeSeries('Spending', [p('Food', 5)])).toBe('Spending: only Food (Rp5).');
    expect(describeSeries('Spending', [])).toBe('Spending: nothing yet.');
  });
});

describe('readoutIndex (T5.33)', () => {
  const nov = [0, 100_000, 150_000, null, 800_000, null];
  it('names the highest bar until one is tapped, then that one; tapping it again goes back to the highest', () => {
    expect(readoutIndex(nov, null)).toBe(4);
    expect(readoutIndex(nov, 1)).toBe(1);
    expect(readoutIndex(nov, 3)).toBe(4); // an empty (future) slot cannot be picked
    expect(readoutIndex([null, 0], null)).toBeNull();
  });
});

describe('signedScale (T5.21, T5.34)', () => {
  it('scales each budget to its own largest saving or overspend, keeping the sign', () => {
    expect(signedScale([5_000, 20_000, -10_000])).toEqual([0.25, 1, -0.5]);
    expect(signedScale([0, 0])).toBeNull();
  });
});
