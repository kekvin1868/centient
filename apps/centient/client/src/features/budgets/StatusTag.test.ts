import { describe, expect, it } from 'vitest';
import src from './StatusTag.tsx?raw';
import { toneOf } from './StatusTag';

describe('StatusTag', () => {
  it('colours each budget status: green, yellow, red', () => {
    expect([toneOf('ON_TRACK'), toneOf('LIKELY_OVER'), toneOf('OVER')]).toEqual([
      'bg-ok',
      'bg-warn',
      'bg-bad',
    ]);
  });
  it('brings no colours of its own', () => expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i));
});
