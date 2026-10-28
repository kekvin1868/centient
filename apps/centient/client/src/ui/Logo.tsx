// Centient's logo: a pixel coin (Miku teal, lit from the top left, its edge showing on the right) with the
// cent sign, and "centient" as a pixel wordmark in lowercase with a Miku-pink dot on the i. Drawn from
// bitmaps, one path per color, so it stays crisp at any size and the wordmark follows the text color.

// . empty, h highlight, r rim, e edge (the coin's side), f face, s the ¢
const COIN = [
  '....hhhhhre....',
  '...hhhffrrree..',
  '..hhffffffrree.',
  '.hhfffffsffrre.',
  '.hfffssssfffree',
  '.hffssffssffree',
  'hhffssffffffrre',
  'hhffssffffffrre',
  'hrffssffffffrre',
  '.rffssffssffree',
  '.rfffssssfffree',
  '.rrfffffsffrre.',
  '..rrffffffrree.',
  '...rrrffrrree..',
  '....rrrrrre....',
];
// x-height 5, ascenders 2; # ink, p pink
const GLYPHS: Record<string, string[]> = {
  c: ['....', '....', '.###', '#...', '#...', '#...', '.###'],
  e: ['....', '....', '.##.', '#..#', '####', '#...', '.###'],
  n: ['....', '....', '###.', '#..#', '#..#', '#..#', '#..#'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'],
  i: ['p', '.', '#', '#', '#', '#', '#'],
};
const FILL: Record<string, string> = {
  h: '#e9fffc', r: '#86cecb', e: '#137a7f', f: 'var(--miku)', s: '#ffffff', '#': 'currentColor', p: 'var(--pink)',
};
const U = 1.5; // wordmark pixel size, in coin pixels

/** Adds one square per pixel to the path for its color. */
function draw(paths: Record<string, string>, rows: string[], ox: number, oy: number, u: number) {
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (FILL[c]) paths[c] = (paths[c] ?? '') + `M${ox + x * u} ${oy + y * u}h${u}v${u}h${-u}z`;
  }));
}

const coinW = COIN[0].length, coinH = COIN.length;
const coinArt: Record<string, string> = {};
draw(coinArt, COIN, 0, 0, 1);
const wordArt: Record<string, string> = {};
let x = 0;
for (const ch of 'centient') { draw(wordArt, GLYPHS[ch], x * U, 0, U); x += GLYPHS[ch][0].length + 1; }
const wordW = (x - 1) * U, wordH = 7 * U;
const wordX = coinW + 2.5, wordY = (coinH - wordH) / 2;
const width = wordX + wordW;

const paths = (art: Record<string, string>) => Object.entries(art).map(([c, d]) => <path key={c} d={d} fill={FILL[c]} />);

/** The lockup: coin + wordmark. Height sets the size; multiples of 15px keep every pixel whole. */
export function Logo({ height = 30, className = '' }: { height?: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${width} ${coinH}`} height={height} width={(height * width) / coinH} shapeRendering="crispEdges" className={`logo-edge ${className}`} role="img" aria-label="Centient">
      {paths(coinArt)}
      <g transform={`translate(${wordX} ${wordY})`}>{paths(wordArt)}</g>
    </svg>
  );
}

/** The coin alone, filling its box (decorative). */
export function CoinMark({ className = '' }: { className?: string }) {
  return <svg viewBox={`0 0 ${coinW} ${coinH}`} shapeRendering="crispEdges" className={className} aria-hidden="true">{paths(coinArt)}</svg>;
}

/** The wordmark alone, in the text color, filling its width. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <svg viewBox={`0 0 ${wordW} ${wordH}`} shapeRendering="crispEdges" className={className} role="img" aria-label="Centient">{paths(wordArt)}</svg>;
}
