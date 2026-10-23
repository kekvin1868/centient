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
