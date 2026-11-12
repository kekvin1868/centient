import { describe, expect, it } from 'vitest';
import { pushBlocker } from './push';

describe('why reminders cannot be turned on', () => {
  const ok = { canPush: true, hasWorker: true };
  it('names the first thing in the way, the server first', () => {
    expect(pushBlocker({ available: true }, ok)).toBeNull();
    expect(pushBlocker({ available: false }, { canPush: false, hasWorker: false })).toBe(
      'Not set up on this server yet.',
    );
    expect(pushBlocker({ available: true }, { ...ok, canPush: false })).toMatch(/Home Screen/);
    expect(pushBlocker({ available: true }, { ...ok, hasWorker: false })).toMatch(
      /development build/,
    );
  });
});
