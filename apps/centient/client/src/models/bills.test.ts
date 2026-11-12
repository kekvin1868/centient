import { describe, expect, it } from 'vitest';
import {
  billSource,
  canSave,
  fillOldestFirst,
  linksOf,
  openBars,
  poolOf,
  setBar,
  type Bar,
} from './bills';

const bills = [
  {
    entryId: 'a',
    occurredAt: '2026-11-01T10:00:00+07:00',
    title: 'Kulkas',
    share: 150_000,
    paid: 0,
    accountId: 'main',
    envelopeId: null,
  },
  {
    entryId: 'b',
    occurredAt: '2026-11-05T10:00:00+07:00',
    title: 'Pizza',
    share: 100_000,
    paid: 0,
    accountId: 'dailies',
    envelopeId: 'food',
  },
  {
    entryId: 'c',
    occurredAt: '2026-11-06T10:00:00+07:00',
    title: 'Done',
    share: 50_000,
    paid: 50_000,
    accountId: 'cash',
    envelopeId: null,
  },
];
const amounts = (bars: Bar[]) => bars.map(b => b.amount);

describe('divide a Paid back over bills', () => {
  it('leaves out paid bills and fills the oldest first (190k over 150k + 100k)', () => {
    const bars = fillOldestFirst(openBars(bills), 190_000);
    expect(bars.map(b => b.id)).toEqual(['a', 'b']);
    expect(amounts(bars)).toEqual([150_000, 40_000]);
    expect(poolOf(bars, 190_000)).toBe(0);
    expect(canSave(bars, 190_000)).toBe(true);
  });

  it('a dragged bar stops at what the bill needs and at what the pool has', () => {
    let bars = fillOldestFirst(openBars(bills), 190_000);
    bars = setBar(bars, 'a', 100_000, 190_000);
    expect(amounts(bars)).toEqual([100_000, 40_000]);
    expect(poolOf(bars, 190_000)).toBe(50_000);
    expect(canSave(bars, 190_000)).toBe(false);
    bars = setBar(bars, 'b', 500_000, 190_000);
    expect(amounts(bars)).toEqual([100_000, 90_000]);
    bars = setBar(bars, 'a', -5, 190_000);
    expect(amounts(bars)).toEqual([0, 90_000]);
  });

  it('paying more than every bill: bars full, the rest stays in the pool as extra', () => {
    const bars = fillOldestFirst(openBars(bills), 300_000);
    expect(amounts(bars)).toEqual([150_000, 100_000]);
    expect(poolOf(bars, 300_000)).toBe(50_000);
    expect(canSave(bars, 300_000)).toBe(true);
  });

  it('links never add up to more than the amount minus the gift, newest gives way', () => {
    const bars = fillOldestFirst(openBars(bills), 250_000);
    expect(linksOf(bars, 200_000)).toEqual([
      { entryId: 'a', amount: 150_000 },
      { entryId: 'b', amount: 50_000 },
    ]);
  });
});

describe('where a Paid back starts', () => {
  it("on the oldest owed bill's account and pocket, else the newest bill's", () => {
    expect(billSource(bills)).toEqual({ accountId: 'main', envelopeId: null });
    expect(billSource(bills.slice(1))).toEqual({ accountId: 'dailies', envelopeId: 'food' });
    expect(billSource(bills.slice(2))).toEqual({ accountId: 'cash', envelopeId: null });
    expect(billSource([])).toBeNull();
  });
});
