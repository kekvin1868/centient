import { describe, expect, it } from 'vitest';
import src from './DatePicker.tsx?raw';
import { monthGrid, plusMonths } from './DatePicker';

describe('DatePicker maths', () => {
  it('shows six weeks from the Sunday on or before the 1st', () => {
    const g = monthGrid('2026-11-17'); // 1 Nov 2026 is a Sunday
    expect([g.length, g[0], g[41]]).toEqual([42, '2026-11-01', '2026-12-12']);
    expect(monthGrid('2027-02-10')[0]).toBe('2027-01-31'); // 1 Feb 2027 is a Monday
  });
  it('moves a month and keeps the day inside it', () => {
    expect(plusMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(plusMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(plusMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('brings no colours of its own', () => expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i));
});
