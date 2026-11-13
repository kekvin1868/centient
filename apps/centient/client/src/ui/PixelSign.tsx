// Small 8-bit signs drawn from bitmaps, in currentColor: `warn` (a waiting row), `stop` (a row that was not sent)
// and `check` (a row that just reached the server; filled in --ok, see .wait-flash in styles.css).
const BITMAPS = {
  warn: [
    '....#....',
    '...###...',
    '...#.#...',
    '..##.##..',
    '..##.##..',
    '.#######.',
    '.###.###.',
    '#########',
  ],
  stop: [
    '..#####..',
    '.#######.',
    '#########',
    '#########',
    '#.......#',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
  ],
  check: [
    '....#####....',
    '..#########..',
    '.###########.',
    '.########..#.',
    '########..###',
    '#######..####',
    '##..##..#####',
    '###....######',
    '####..#######',
    '.###########.',
    '.###########.',
    '..#########..',
    '....#####....',
  ],
};
export type Sign = keyof typeof BITMAPS;

// One rectangle per run of lit pixels.
const PATHS = Object.fromEntries(
  Object.entries(BITMAPS).map(([name, rows]) => [
    name,
    rows
      .flatMap((row, y) =>
        [...row.matchAll(/#+/g)].map(m => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`),
      )
      .join(''),
  ]),
) as Record<Sign, string>;

export function PixelSign({
  sign,
  size = 12,
  className = '',
}: {
  sign: Sign;
  size?: number;
  className?: string;
}) {
  const rows = BITMAPS[sign];
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg
      className={`inline-block shrink-0 ${className}`}
      width={(size * w) / Math.max(w, h)}
      height={(size * h) / Math.max(w, h)}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <path d={PATHS[sign]} fill="currentColor" />
    </svg>
  );
}
