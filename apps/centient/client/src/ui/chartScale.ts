// Pure helpers behind the hand-drawn charts: bar lengths and the sentence a screen reader hears instead of the picture.

/** Each value as a share of the largest (the tallest bar fills the plot). Negatives clamp to 0; null when all are 0 (draw the empty state). */
export function barScale(values: number[]): number[] | null {
  const clean = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
  const max = Math.max(0, ...clean);
  return max === 0 ? null : clean.map(v => v / max);
}

/** One sentence naming the highest and lowest point of a series, e.g. "Spending by category: highest Shopping (Rp800.000), lowest Fees (Rp2.500)." */
export function describeSeries(name: string, points: { label: string; value: number; shown: string }[]): string {
  if (!points.length || points.every(p => p.value <= 0)) return `${name}: nothing yet.`;
  const sorted = [...points].sort((a, b) => b.value - a.value);
  const [hi, lo] = [sorted[0], sorted[sorted.length - 1]];
  return sorted.length === 1 ? `${name}: only ${hi.label} (${hi.shown}).` : `${name}: highest ${hi.label} (${hi.shown}), lowest ${lo.label} (${lo.shown}).`;
}
