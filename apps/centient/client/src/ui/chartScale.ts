// Pure helpers behind the hand-drawn charts: bar lengths and the sentence a screen reader hears instead of the picture.

/** Each value as a share of the largest (the tallest bar fills the plot). Negatives clamp to 0; null when all are 0 (draw the empty state). */
export function barScale(values: number[]): number[] | null {
  const clean = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
  const max = Math.max(0, ...clean);
  return max === 0 ? null : clean.map(v => v / max);
}

/** One sentence naming the highest and lowest point of a series, e.g. "Spending by category: highest Shopping (Rp800.000), lowest Fees (Rp2.500)." */
export function describeSeries(
  name: string,
  points: { label: string; value: number; shown: string }[],
): string {
  if (!points.length || points.every(p => p.value <= 0)) return `${name}: nothing yet.`;
  const sorted = [...points].sort((a, b) => b.value - a.value);
  const [hi, lo] = [sorted[0], sorted[sorted.length - 1]];
  return sorted.length === 1
    ? `${name}: only ${hi.label} (${hi.shown}).`
    : `${name}: highest ${hi.label} (${hi.shown}), lowest ${lo.label} (${lo.shown}).`;
}

/** Which bar the readout line names: the tapped one, else the highest (first of equals); null when nothing has a value. */
export function readoutIndex(values: (number | null)[], picked: number | null): number | null {
  if (picked !== null && values[picked] !== null && values[picked] !== undefined) return picked;
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v !== null && v > 0 && (best === null || v > values[best]!)) best = i;
  });
  return best;
}

/** Bars that go both ways around a middle line: each value over the largest absolute one, so -1..1; null when all are 0. */
export function signedScale(values: number[]): number[] | null {
  const max = Math.max(0, ...values.map(Math.abs));
  return max === 0 ? null : values.map(v => v / max);
}
