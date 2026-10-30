import { describe, expect, it } from 'vitest';
import src from './WinButton.tsx?raw';

describe('WinButton', () => {
  it('reuses the dialog title-bar button style and brings no colours of its own', () => {
    expect(src).toContain('className="n-win"');
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
