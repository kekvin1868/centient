// Pocket colors: Miku's palette plus pastels that sit well next to it. A pocket stores its hex (or null for
// the default by position: Main is Miku teal, the others cycle through the set). Text on a card is dark ink
// or white, whichever reads better on that color.
export const POCKET_COLORS: { name: string; hex: string }[] = [
  { name: 'Miku teal', hex: '#1ff0dc' }, { name: 'Aqua', hex: '#86cecb' }, { name: 'Pink', hex: '#ff8cc6' },
  { name: 'Lilac', hex: '#c3b1ff' }, { name: 'Sky', hex: '#8fd3ff' }, { name: 'Mint', hex: '#9ff2c6' },
  { name: 'Silver', hex: '#bec8d1' }, { name: 'Deep teal', hex: '#137a7f' }, { name: 'Ribbon pink', hex: '#e12885' },
  { name: 'Charcoal', hex: '#373b3e' },
];

/** The pocket's color: its own, else Miku teal for Main, else the set in order by position. */
export function pocketColor(color: string | null, index: number, main: boolean): string {
  if (color) return color;
  if (main) return POCKET_COLORS[0].hex;
  return POCKET_COLORS[1 + (Math.max(0, index - 1) % (POCKET_COLORS.length - 1))].hex; // Main sits at index 0
}

/** A color for a new pocket: the first in the set that the account's pockets don't use yet. */
export function nextPocketColor(used: (string | null)[]): string {
  return (POCKET_COLORS.slice(1).find(c => !used.includes(c.hex)) ?? POCKET_COLORS[1]).hex;
}

/** Dark ink or white, by the color's relative luminance (WCAG). */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0b0f10' : '#ffffff';
}

/**
 * Twelve card patterns, drawn with CSS gradients in `--pc` (a tint of the card's ink). A pocket's `pattern`
 * (0-23) picks one; 12-23 are the same twelve turned 90 degrees. Painted once: moving the card doesn't repaint.
 */
const PATTERNS = [
  'radial-gradient(circle, var(--pc) 1.3px, transparent 1.7px) 0 0 / 8px 8px', // dots
  'repeating-linear-gradient(45deg, var(--pc) 0 2px, transparent 2px 10px)', // stripes
  'linear-gradient(var(--pc) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, var(--pc) 1px, transparent 1px) 0 0 / 14px 14px', // grid
  'conic-gradient(var(--pc) 25%, transparent 0 50%, var(--pc) 0 75%, transparent 0) 0 0 / 16px 16px', // checks
  'radial-gradient(circle at 50% 0, transparent 6px, var(--pc) 6.5px 8px, transparent 8.5px) 0 0 / 18px 11px', // waves
  'linear-gradient(135deg, var(--pc) 25%, transparent 25%) -7px 0 / 14px 14px, linear-gradient(225deg, var(--pc) 25%, transparent 25%) -7px 0 / 14px 14px', // chevrons
  'repeating-radial-gradient(circle at 100% 100%, var(--pc) 0 2px, transparent 2px 11px)', // rings
  'repeating-linear-gradient(45deg, var(--pc) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, var(--pc) 0 1px, transparent 1px 9px)', // cross-hatch
  'repeating-linear-gradient(90deg, var(--pc) 0 1.5px, transparent 1.5px 8px)', // pinstripes
  'radial-gradient(circle at 50% 100%, transparent 6px, var(--pc) 6.5px 8px, transparent 8.5px) 0 0 / 16px 9px', // scales
  'linear-gradient(45deg, var(--pc) 25%, transparent 25% 75%, var(--pc) 75%) 0 0 / 14px 14px', // diamonds
  'repeating-conic-gradient(from 0deg at 100% 100%, var(--pc) 0 3deg, transparent 3deg 10deg)', // sunburst
];
export const patternOf = (pattern: number) => ({ background: PATTERNS[pattern % 12], turned: pattern >= 12 });
