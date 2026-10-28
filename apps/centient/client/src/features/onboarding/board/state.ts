// The flow board's content: where each account frame sits, arrows between ports (an account or a pocket, by
// draft key) and pen strokes, all in world coordinates. Pure updates; FlowBoard keeps the undo history.
export type Point = [number, number];
export type Link = { id: string; from: string; to: string };
export type Stroke = { id: string; pts: Point[] };
export type Board = { pos: Record<string, { x: number; y: number }>; links: Link[]; strokes: Stroke[] };

export const emptyBoard = (): Board => ({ pos: {}, links: [], strokes: [] });

let seq = 0;
export const markId = (p: 'l' | 's') => `${p}${++seq}`;

export const FRAME_W = 220;
const COL_GAP = 40, ROW_GAP = 60;
/** A frame's height before it is measured: header plus one row per pocket. */
export const frameHeight = (pockets: number) => 74 + pockets * 46;

/** Frames without a place stack into the shorter of two columns, under what's already there. */
export function place(board: Board, frames: { key: string; pockets: number }[]): Board {
  const bottoms = [0, 0];
  const col = (x: number) => (x < FRAME_W / 2 + COL_GAP ? 0 : 1);
  for (const f of frames) {
    const p = board.pos[f.key];
    if (p) bottoms[col(p.x)] = Math.max(bottoms[col(p.x)], p.y + frameHeight(f.pockets) + ROW_GAP);
  }
  const pos = { ...board.pos };
  for (const f of frames) {
    if (pos[f.key]) continue;
    const c = bottoms[0] <= bottoms[1] ? 0 : 1;
    pos[f.key] = { x: c * (FRAME_W + COL_GAP), y: bottoms[c] };
    bottoms[c] += frameHeight(f.pockets) + ROW_GAP;
  }
  return { ...board, pos };
}

export const addLink = (b: Board, from: string, to: string): Board =>
  from === to || b.links.some(l => l.from === from && l.to === to) ? b : { ...b, links: [...b.links, { id: markId('l'), from, to }] };

/** Removes links and strokes by id. */
export const erase = (b: Board, ids: Set<string>): Board =>
  ({ ...b, links: b.links.filter(l => !ids.has(l.id)), strokes: b.strokes.filter(s => !ids.has(s.id)) });
