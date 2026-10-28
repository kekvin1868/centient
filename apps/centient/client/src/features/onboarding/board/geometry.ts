// Arrow and camera math for the flow board. Boxes are in world coordinates.
export type Box = { x: number; y: number; w: number; h: number };

/** Where the line from a box's center toward (tx, ty) leaves its border (plus a small gap), so arrows meet edges. */
export function edge(b: Box, tx: number, ty: number): [number, number] {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? (b.w / 2 + 7) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + 7) / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/** A gentle curve from a to b; two-way links bow apart (`bend`) so both arrows stay visible. */
export function linkPath(a: Box, b: Box, bend: boolean): string {
  const ac = [a.x + a.w / 2, a.y + a.h / 2], bc = [b.x + b.w / 2, b.y + b.h / 2];
  const nx = bc[1] - ac[1], ny = ac[0] - bc[0], l = Math.hypot(nx, ny) || 1, o = bend ? 26 : 0;
  const mx = (ac[0] + bc[0]) / 2 + (nx / l) * o, my = (ac[1] + bc[1]) / 2 + (ny / l) * o;
  const [x1, y1] = edge(a, mx, my), [x2, y2] = edge(b, mx, my);
  return `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`;
}

export const strokePath = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');

export const ZOOM_MIN = 0.3, ZOOM_MAX = 2;
export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

export type Camera = { x: number; y: number; z: number };

/** Zoom to `z` keeping the screen point (sx, sy) over the same world point. */
export function zoomAt(c: Camera, z: number, sx: number, sy: number): Camera {
  const nz = clampZoom(z);
  return { x: sx - ((sx - c.x) * nz) / c.z, y: sy - ((sy - c.y) * nz) / c.z, z: nz };
}

/** The camera that shows every box inside the view, never zoomed past 100%; `pad` leaves room for the chrome. */
export function fitCamera(boxes: Box[], view: { w: number; h: number }, pad: { top: number; bottom: number; side: number }): Camera | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
  const w = view.w - pad.side * 2, h = view.h - pad.top - pad.bottom;
  const z = clampZoom(Math.min(1, w / (x1 - x0 || 1), h / (y1 - y0 || 1)));
  return { z, x: pad.side + (w - (x1 - x0) * z) / 2 - x0 * z, y: pad.top + Math.max(0, (h - (y1 - y0) * z) / 2) - y0 * z };
}
