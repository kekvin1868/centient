import { describe, expect, it } from 'vitest';
import { returnState } from './ReturnDue';

describe('Home strip for money you owe', () => {
  it('not kept: owed back now', () => {
    expect(returnState(null, '2026-11-10')).toEqual({ kept: false, line: 'Money to give back' });
  });
  it('kept: calm before the day, a warning on and after it', () => {
    expect(returnState('2026-11-30', '2026-11-10').kept).toBe(true);
    expect(returnState('2026-11-30', '2026-11-30')).toEqual({ kept: false, line: 'Return today' });
    expect(returnState('2026-11-30', '2026-12-01').line).toBe('1 day late');
    expect(returnState('2026-11-30', '2026-12-03').line).toBe('3 days late');
  });
});
