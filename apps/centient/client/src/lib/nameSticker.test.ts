import { describe, expect, it } from 'vitest';
import { STICKER_MS, stickersOf } from './nameSticker';

const T0 = Date.parse('2026-11-03T10:00:00Z');
const person = (o: object = {}) => ({ kind: 'IOU', archived_at: null, ...o });

describe('stickersOf (T10, T12)', () => {
  const renamed = person({ formerNames: [{ name: 'Abang', at: new Date(T0).toISOString() }] });

  it('shows "was Abang" 47 hours after a rename and not 49 hours after', () => {
    expect(stickersOf(renamed, T0 + 47 * 3_600_000)).toEqual(['was Abang']);
    expect(stickersOf(renamed, T0 + 49 * 3_600_000)).toEqual([]);
    expect(STICKER_MS).toBe(48 * 3_600_000);
  });

  it('shows only the latest old name', () => {
    const twice = person({
      formerNames: [
        { name: 'Obang', at: new Date(T0).toISOString() },
        { name: 'Abang', at: new Date(T0 - 1000).toISOString() },
      ],
    });
    expect(stickersOf(twice, T0 + 1000)).toEqual(['was Obang']);
  });

  it('shows "archived" for 2 days, and nothing once restored', () => {
    const hidden = person({ archived_at: new Date(T0).toISOString() });
    expect(stickersOf(hidden, T0 + 47 * 3_600_000)).toEqual(['archived']);
    expect(stickersOf(hidden, T0 + 49 * 3_600_000)).toEqual([]);
    expect(stickersOf({ ...hidden, archived_at: null }, T0)).toEqual([]);
  });

  it('skips banks, wallets and unknown accounts', () => {
    expect(stickersOf({ ...renamed, kind: 'BANK' }, T0)).toEqual([]);
    expect(stickersOf(undefined, T0)).toEqual([]);
  });
});
