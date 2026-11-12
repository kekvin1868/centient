// How due dates read on screen (pure; no network).
import { describe, expect, it } from 'vitest';
import { comingUp, dueByDay, dueWords } from './recurring';
import { bill } from './recurring.fixture';

describe('due dates on screen', () => {
  it('words a due date from today', () => {
    expect(dueWords('2026-11-12', '2026-11-12')).toBe('Due today');
    expect(dueWords('2026-11-13', '2026-11-12')).toBe('Due tomorrow');
    expect(dueWords('2026-11-20', '2026-11-12')).toBe('Due in 8 days');
    expect(dueWords('2026-11-11', '2026-11-12')).toBe('1 day late');
    expect(dueWords('2026-11-09', '2026-11-12')).toBe('3 days late');
  });

  it('lists what is coming up: soon or late, not paused, cards with money left', () => {
    const card = {
      accountId: 'card',
      cutOff: '2026-10-20',
      dueOn: '2026-11-15',
      bill: 1_000_000,
      left: 600_000,
      spentSince: 0,
    };
    const list = {
      today: '2026-11-12',
      totals: [],
      items: [
        bill({ id: 'soon', nextDue: '2026-11-19' }),
        bill({ id: 'late', nextDue: '2026-11-10' }),
        bill({ id: 'far', nextDue: '2026-11-20' }),
        bill({ id: 'paused', nextDue: '2026-11-13', paused: true }),
      ],
      cards: [
        card,
        { ...card, accountId: 'paid', left: 0 },
        { ...card, accountId: 'nodue', dueOn: null },
      ],
    };
    expect(comingUp(list).map(u => u.key)).toEqual([
      'recurring:late',
      'card:card',
      'recurring:soon',
    ]);
  });

  it('groups bills by the day they fall due', () => {
    const byDay = dueByDay([bill(), bill({ id: 'r2', name: 'Spotify', dues: ['2026-11-20'] })]);
    expect(byDay.get('2026-11-20')?.map(b => b.name)).toEqual(['Netflix', 'Spotify']);
    expect(byDay.get('2026-12-20')?.map(b => b.name)).toEqual(['Netflix']);
    expect(byDay.get('2026-11-21')).toBeUndefined();
  });
});
