import { describe, expect, it } from 'vitest';
import { shareMath, withPeople, blankParty } from './shares';

const none = (n: number) => Array<number | null>(n).fill(null);

describe('shareMath (T1-T5)', () => {
  it('T1: 100.000 between 4 is 25.000 each', () => {
    const s = shareMath(100_000, none(3), null);
    expect(s).toMatchObject({ mine: 25_000, others: [25_000, 25_000, 25_000], problem: null });
  });

  it('T2: A typed 10.000, the rest (me, B, C) share 90.000 as 30.000 each', () => {
    const s = shareMath(100_000, [10_000, null, null], null);
    expect(s).toMatchObject({ mine: 30_000, others: [10_000, 30_000, 30_000], problem: null });
  });

  it('T3: one person leaves, 3 people, I take the rounding', () => {
    expect(shareMath(100_000, none(2), null)).toMatchObject({
      mine: 33_334,
      others: [33_333, 33_333],
    });
  });

  it('T4: one person joins, 5 people, 20.000 each', () => {
    expect(shareMath(100_000, none(4), null)).toMatchObject({
      mine: 20_000,
      others: [20_000, 20_000, 20_000, 20_000],
    });
  });

  it('T5: everyone typed, 85.000 of 100.000: gap 15.000 and Save is blocked', () => {
    const s = shareMath(100_000, [10_000, 25_000, 25_000], 25_000);
    expect(s).toMatchObject({ problem: 'gap', gap: 15_000 });
  });

  it('everyone typed and adding up is fine', () => {
    expect(shareMath(100_000, [10_000, 40_000], 50_000).problem).toBeNull();
  });

  it('flags amounts over the total and a share that leaves me nothing', () => {
    expect(shareMath(100_000, [90_000, 20_000], null)).toMatchObject({
      problem: 'over',
      gap: -10_000,
    });
    expect(shareMath(100_000, [60_000, 40_000], null)).toMatchObject({ mine: 0, problem: 'mine' });
  });

  it('when I type my own amount the first free person takes the rounding', () => {
    const s = shareMath(100_000, [null, null], 50_000);
    expect(s.others).toEqual([25_000, 25_000]);
    expect(shareMath(100_001, [null, null], 50_000).others).toEqual([25_001, 25_000]);
  });

  it('without an amount everything is 0 and nothing is flagged', () => {
    expect(shareMath(null, none(2), null)).toMatchObject({ mine: 0, others: [0, 0] });
  });
});

describe('withPeople', () => {
  const f = {
    split: 3 as number | null,
    parties: [blankParty(), { ...blankParty(), name: 'Budi' }],
  };
  it('adds blank people and takes them from the end', () => {
    expect(withPeople(f, 4).parties).toHaveLength(3);
    expect(withPeople(f, 2).parties.map(p => p.name)).toEqual(['']);
  });
  it('one person means no split', () => {
    expect(withPeople(f, 1)).toMatchObject({ split: null, parties: [] });
  });
});
