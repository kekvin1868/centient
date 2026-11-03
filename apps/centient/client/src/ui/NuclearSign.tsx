// A pixel radiation trefoil (14 x 14 grid) that blinks like an old alarm: lit 4.5 s, dark 0.5 s (`.alarm` in
// styles.css; still under reduced motion). Drawn in currentColor, so the parent picks the warning colour.
const BITMAP = [
  '..............',
  '..##......##..',
  '.###......###.',
  '.####....####.',
  '######..######',
  '#####....#####',
  '#####.##.#####',
  '......##......',
  '..............',
  '......##......',
  '.....####.....',
  '....######....',
  '....######....',
  '....######....',
];

// One rectangle per run of lit pixels.
const PATH = BITMAP.flatMap((row, y) => [...row.matchAll(/#+/g)].map(m => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('');

export function NuclearSign({ label, size = 28 }: { label: string; size?: number }) {
  return (
    <svg className="alarm inline-block shrink-0" width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" role="img" aria-label={label}>
      <path d={PATH} fill="currentColor" />
    </svg>
  );
}
