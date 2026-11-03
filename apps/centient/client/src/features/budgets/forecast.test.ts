import { afterEach, describe, expect, it, vi } from 'vitest';
import { forecastLine, forecastView, loadStartDay, period, rupiahLeft, startDayFor, STATUS_LABEL } from './forecast';

// November 2026, a 30-day cycle, limit Rp3.000.000.
const row = (daysGone: number, spent: number, status: 'ON_TRACK' | 'LIKELY_OVER' | 'OVER' = 'LIKELY_OVER') =>
  ({ currency: 'IDR', spent, limit: 3_000_000, daysGone, projected: Math.round((spent * 30) / daysGone), status });
const TO = '2026-12-01';

describe('forecastView', () => {
  it('counts down to the start day, then shows the forecast', () => {
    expect(forecastView(row(1, 500_000), 3, TO)).toEqual({ hint: 'Forecast starts on day 3 · 2 days to go' });
    expect(forecastView(row(2, 500_000), 3, TO)).toEqual({ hint: 'Forecast starts on day 3 · 1 day to go' });
    expect(forecastView(row(3, 500_000), 3, TO)).toEqual({ status: 'LIKELY_OVER', line: 'At this rate: Rp5jt by 30 Nov · runs out around day 18' });
  });

  it('shows Over from day 1', () => expect(forecastView(row(1, 3_500_000, 'OVER'), 3, TO)).toEqual({ status: 'OVER' }));

  it('follows the setting from 1 to 7', () => {
    expect(forecastView(row(1, 100_000, 'ON_TRACK'), 1, TO).status).toBe('ON_TRACK');
    expect(forecastView(row(6, 100_000, 'ON_TRACK'), 7, TO).hint).toBe('Forecast starts on day 7 · 1 day to go');
    expect(forecastView(row(7, 100_000, 'ON_TRACK'), 7, TO).status).toBe('ON_TRACK');
  });

  it('shows nothing for another cycle', () =>
    expect(forecastView({ ...row(1, 100_000, 'ON_TRACK'), daysGone: null, projected: null }, 3, TO)).toEqual({}));
});

describe('forecastLine', () => {
  it('names the amount by the last day, and when the money runs out', () => {
    expect(forecastLine(row(10, 1_200_000), TO)).toBe('At this rate: Rp3,6jt by 30 Nov · runs out around day 25');
    expect(forecastLine(row(10, 800_000, 'ON_TRACK'), TO)).toBe('At this rate: Rp2,4jt by 30 Nov');
    // A 14-day stretch ending 14 Nov: 100,000 of 250,000 gone by day 4.
    const short = { currency: 'IDR', spent: 100_000, limit: 250_000, daysGone: 4, projected: 350_000, status: 'LIKELY_OVER' as const };
    expect(forecastLine(short, '2026-11-15')).toBe('At this rate: Rp350rb by 14 Nov · runs out around day 10');
  });
});

describe('status words', () => {
  it('are the only three', () =>
    expect(STATUS_LABEL).toEqual({ ON_TRACK: 'On track', LIKELY_OVER: 'Likely over', OVER: 'Over' }));
});

describe('forecast start day setting', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stored = (raw: string | null) => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'centient:forecastStartDay' ? raw : null) });
    return loadStartDay();
  };

  it('clamps to 1-7 and turns junk or nothing into 3', () =>
    expect(['0', '9', '"abc"', 'abc', '2.5', '5', null].map(stored)).toEqual([1, 7, 3, 3, 3, 5, 3]));

  it('falls back to 3 when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(loadStartDay()).toBe(3);
  });
});

describe('rupiahLeft', () => {
  it('adds up rupiah cycle budgets only', () =>
    expect(rupiahLeft([
      { currency: 'IDR', remaining: 1_000_000, safePerDay: 50_000, startsOn: null },
      { currency: 'IDR', remaining: -200_000, safePerDay: 0, startsOn: null },
      { currency: 'USD', remaining: 30_000, safePerDay: 1_000, startsOn: null },
      { currency: 'IDR', remaining: 250_000, safePerDay: 17_000, startsOn: '2026-11-10' },
    ])).toEqual({ count: 2, left: 1_000_000, perDay: 50_000 }));
});

describe('temporary budgets', () => {
  it('wait at most half their length for the forecast', () =>
    expect([[3, 14], [3, 5], [3, 3], [3, 2], [7, 14], [7, 10]].map(([n, d]) => startDayFor(n, d))).toEqual([3, 2, 1, 1, 7, 5]));

  it('write their days with the last one included', () => {
    expect(period('2026-11-10', '2026-11-24')).toBe('Nov 10–23');
    expect(period('2026-11-28', '2026-12-05')).toBe('Nov 28–Dec 4');
  });
});
