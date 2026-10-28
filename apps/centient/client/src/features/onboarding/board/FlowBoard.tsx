// The flow board: an endless canvas over the menu (Excalidraw-like). Drag the board to pan, pinch or ⌘/Ctrl-scroll
// to zoom. Tools: MOVE drags account frames (pockets ride along), LINK draws arrows between any two ports (drag
// one onto another, or tap one then the other), PEN sketches, ERASE removes marks it touches. Every change is one
// undo step; undo glides frames back and arrows follow.
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { showToast } from '../../../ui/Toast';
import { useFx } from '../../../ui/night/tv';
import { useLayerKeys } from '../../../ui/night/useLayers';
import { kept, type Draft } from '../model/draft';
import { AccountFrame } from './AccountFrame';
import { edge, fitCamera, linkPath, strokePath, zoomAt, type Box, type Camera } from './geometry';
import { LinkLayer, type Mark } from './LinkLayer';
import { addLink, erase, markId, place, type Board, type Point } from './state';
import { Toolbar, type Tool } from './Toolbar';
import { useCamera } from './useCamera';

type Props = { draft: Draft; board: Board; setBoard: (b: Board) => void; undo: () => boolean; onClose: () => void };
type Port = { frame: string; x: number; y: number; w: number; h: number };
type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; tap: boolean }
  | { kind: 'frame'; key: string; ox: number; oy: number; moved: boolean }
  | { kind: 'link'; from: string; x0: number; y0: number; moved: boolean }
  | { kind: 'pen'; id: string }
  | { kind: 'erase'; hit: Set<string> };

const PAD = { top: 124, bottom: 150, side: 20 };
const EASE_MS = 340;

export function FlowBoard({ draft, board, setBoard, undo, onClose }: Props) {
  const view = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const { cam, setCam, gliding, glide, local, toWorld, zoomBy, panBy } = useCamera(view);
  const { leave, cls } = useFx(undefined, ['tv', 'glitch']);
  const [tool, setTool] = useState<Tool>('move');
  const [src, setSrc] = useState<string | null>(null); // first port of a tap-tap link
  const [live, setLive] = useState<Board | null>(null); // the board mid-gesture; committed on release
  const [ghost, setGhost] = useState<string | null>(null);
  const [grab, setGrab] = useState<string | null>(null);
  const [drops, setDrops] = useState<Record<string, number>>({});
  const [ports, setPorts] = useState<Record<string, Port>>({});
  const drag = useRef<Drag | null>(null);
  const fingers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; mid: [number, number]; cam: Camera } | null>(null);
  const space = useRef(false);

  const frames = useMemo(() => draft.map(a => ({ key: a.key, pockets: a.pockets.length })), [draft]);
  const base = useMemo(() => place(board, frames), [board, frames]);
  const shown = live ?? base;

  // Ports are measured once laid out; their offsets inside a frame don't change while it moves.
  useLayoutEffect(() => {
    const next: Record<string, Port> = {};
    world.current?.querySelectorAll<HTMLElement>('[data-frame]').forEach(f => {
      const frame = f.dataset.frame!;
      next[frame + ':frame'] = { frame, x: 0, y: 0, w: f.offsetWidth, h: f.offsetHeight };
      f.querySelectorAll<HTMLElement>('[data-port]').forEach(p => {
        next[p.dataset.port!] = { frame, x: p.offsetLeft, y: p.offsetTop, w: p.offsetWidth, h: p.offsetHeight };
      });
    });
    setPorts(next);
  }, [draft]);
  const box = (key: string, b: Board = shown): Box | null => {
    const p = ports[key], at = p && b.pos[p.frame];
    return at ? { x: at.x + p.x, y: at.y + p.y, w: p.w, h: p.h } : null;
  };
  const frameBoxes = () => draft.map(a => box(a.key + ':frame')).filter((b): b is Box => b !== null);
  const fit = () => {
    const c = view.current && fitCamera([...frameBoxes(), ...shown.strokes.flatMap(s => s.pts.map(([x, y]) => ({ x, y, w: 0, h: 0 })))], { w: view.current.clientWidth, h: view.current.clientHeight }, PAD);
    if (c) setCam(c);
  };
  const fitted = useRef(false);
  useLayoutEffect(() => { if (!fitted.current && Object.keys(ports).length) { fitted.current = true; fit(); } });

  const marks: Mark[] = [];
  for (const l of shown.links) {
    const a = box(l.from), b = box(l.to);
    if (a && b) marks.push({ id: l.id, kind: 'link', d: linkPath(a, b, shown.links.some(m => m.from === l.to && m.to === l.from)) });
  }
  for (const s of shown.strokes) marks.push({ id: s.id, kind: 'ink', d: strokePath(s.pts) });

  const commit = (b: Board) => { setLive(null); if (b !== base) setBoard(b); };
  // Undo eases frames from where they are to where they were; arrows follow because they're drawn from positions.
  const undoGlide = () => {
    const from = shown.pos;
    if (!undo()) { showToast('NOTHING TO UNDO'); return; }
    tween.current = from;
  };
  const tween = useRef<Board['pos'] | null>(null);
  useLayoutEffect(() => {
    const from = tween.current;
    if (!from) return;
    tween.current = null;
    const to = base.pos, t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / EASE_MS), e = 1 - (1 - k) ** 3;
      const pos: Board['pos'] = {};
      for (const key of Object.keys(to)) {
        const a = from[key] ?? to[key], b = to[key];
        pos[key] = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      }
      setLive(k < 1 ? { ...base, pos } : null);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [base]);

  const eraseAt = (cx: number, cy: number, d: Extract<Drag, { kind: 'erase' }>) => {
    const id = (document.elementFromPoint(cx, cy)?.closest('[data-mark]') as HTMLElement | null)?.dataset.mark;
    if (!id || d.hit.has(id)) return;
    d.hit.add(id);
    setLive(b => erase(b ?? base, new Set([id])));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    view.current!.setPointerCapture(e.pointerId);
    fingers.current.set(e.pointerId, local(e.clientX, e.clientY));
    if (fingers.current.size === 2) {
      // A second finger turns whatever was happening into a pinch.
      drag.current = null; setLive(null); setGhost(null); setGrab(null);
      const [a, b] = [...fingers.current.values()];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cam };
      return;
    }
    if (fingers.current.size > 2) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY, cam);
    const target = e.target as Element;
    const frame = (target.closest('[data-frame]') as HTMLElement | null)?.dataset.frame;
    const port = (target.closest('[data-port]') as HTMLElement | null)?.dataset.port;
    if (space.current || e.button === 1) drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam, tap: false };
    else if (tool === 'pen') {
      const id = markId('s');
      drag.current = { kind: 'pen', id };
      setLive({ ...base, strokes: [...base.strokes, { id, pts: [[Math.round(wx), Math.round(wy)]] }] });
    } else if (tool === 'erase') {
      const d: Drag = { kind: 'erase', hit: new Set() };
      drag.current = d;
      eraseAt(e.clientX, e.clientY, d);
    } else if (tool === 'move' && frame) {
      const p = base.pos[frame];
      drag.current = { kind: 'frame', key: frame, ox: wx - p.x, oy: wy - p.y, moved: false };
    } else if (tool === 'link' && port) drag.current = { kind: 'link', from: port, x0: wx, y0: wy, moved: false };
    else drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam, tap: true };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, local(e.clientX, e.clientY));
    const p = pinch.current;
    if (p) {
      if (fingers.current.size < 2) return;
      const [a, b] = [...fingers.current.values()];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const z = zoomAt(p.cam, (p.cam.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / p.d, p.mid[0], p.mid[1]);
      setCam({ ...z, x: z.x + mid[0] - p.mid[0], y: z.y + mid[1] - p.mid[1] });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY, cam);
    if (d.kind === 'pan') {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.hypot(dx, dy) > 5) d.tap = false;
      setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
    } else if (d.kind === 'pen') {
      setLive(b => {
        if (!b) return b;
        const s = b.strokes[b.strokes.length - 1], last = s.pts[s.pts.length - 1];
        if (Math.hypot(wx - last[0], wy - last[1]) <= 3 / cam.z) return b;
        const pt: Point = [Math.round(wx), Math.round(wy)];
        return { ...b, strokes: [...b.strokes.slice(0, -1), { ...s, pts: [...s.pts, pt] }] };
      });
    } else if (d.kind === 'erase') eraseAt(e.clientX, e.clientY, d);
    else if (d.kind === 'frame') {
      if (!d.moved) { d.moved = true; setGrab(d.key); }
      setLive(b => ({ ...(b ?? base), pos: { ...(b ?? base).pos, [d.key]: { x: Math.round(wx - d.ox), y: Math.round(wy - d.oy) } } }));
    } else if (d.kind === 'link') {
      if (Math.hypot(wx - d.x0, wy - d.y0) > 8 / cam.z) d.moved = true;
      const from = box(d.from);
      if (d.moved && from) { const [x1, y1] = edge(from, wx, wy); setGhost(`M${x1} ${y1}L${wx} ${wy}`); }
    }
  };

  const up = (e: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) { if (fingers.current.size < 2) pinch.current = null; drag.current = null; return; }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pen') {
      const s = live?.strokes[live.strokes.length - 1];
      if (live && s && s.pts.length > 1) commit(live); else setLive(null);
    } else if (d.kind === 'erase') { if (live) commit(live); }
    else if (d.kind === 'frame') {
      setGrab(null);
      if (d.moved && live) { commit(live); setDrops(x => ({ ...x, [d.key]: (x[d.key] ?? 0) + 1 })); }
    } else if (d.kind === 'link') {
      setGhost(null);
      const over = (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-port]') as HTMLElement | null)?.dataset.port;
      if (d.moved) { if (over) commit(addLink(base, d.from, over)); }
      else if (src && src !== d.from) { commit(addLink(base, src, d.from)); setSrc(null); }
      else setSrc(src === d.from ? null : d.from);
    } else if (d.tap && src) setSrc(null);
  };

  const clear = () => {
    if (!base.links.length && !base.strokes.length) return;
    setBoard({ ...base, links: [], strokes: [] });
    showToast('BOARD CLEARED');
  };
  const close = async () => { await leave(); onClose(); };
  const pickTool = (t: Tool) => { setTool(t); setSrc(null); };

  useLayerKeys(e => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); undoGlide(); return; }
    if (e.metaKey || e.ctrlKey) return;
    if (k === 'escape' || k === 'c') { e.preventDefault(); close(); }
    else if (k === ' ') { e.preventDefault(); space.current = true; }
    else if (k === 'v' || k === 'h' || k === 'm') pickTool('move');
    else if (k === 'l') pickTool('link');
    else if (k === 'p') pickTool('pen');
    else if (k === 'e') pickTool('erase');
    else if (k === '+' || k === '=') zoomBy(1.25);
    else if (k === '-') zoomBy(0.8);
    else if (k === '0') { glide(); setCam(c => zoomAt(c, 1, view.current!.clientWidth / 2, view.current!.clientHeight / 2)); }
    else if (k === 'f') { glide(); fit(); }
    else if (k.startsWith('arrow')) {
      e.preventDefault();
      panBy(k === 'arrowleft' ? 60 : k === 'arrowright' ? -60 : 0, k === 'arrowup' ? 60 : k === 'arrowdown' ? -60 : 0);
    }
  });
  // Wheel pans, ⌘/Ctrl-wheel (and trackpad pinch) zooms; a native listener so the page itself never zooms.
  useLayoutEffect(() => {
    const el = view.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) setCam(c => zoomAt(c, c.z * Math.exp(-e.deltaY * 0.01), x, y));
      else setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [local, setCam]);
  useLayoutEffect(() => {
    const keyup = (e: KeyboardEvent) => { if (e.key === ' ') space.current = false; };
    document.addEventListener('keyup', keyup);
    return () => document.removeEventListener('keyup', keyup);
  }, []);

  return (
    <div className={`n-canvas ${cls}`} role="dialog" aria-label="Flow board">
      <div ref={view} className={`cv-board ${tool} ${drag.current?.kind === 'pan' ? 'panning' : ''}`}
        style={{ backgroundSize: `${16 * cam.z}px ${16 * cam.z}px`, backgroundPosition: `${cam.x}px ${cam.y}px` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div ref={world} className={`cv-world ${gliding ? 'glide' : ''}`} style={{ transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.z})` }}>
          {draft.map((a, i) => {
            const p = shown.pos[a.key];
            return p && <AccountFrame key={a.key} account={a} x={p.x} y={p.y} grab={grab === a.key} drop={drops[a.key] ?? 0} hot={src} delay={i * 45} />;
          })}
          <LinkLayer marks={marks} live={drag.current?.kind === 'pen' ? drag.current.id : null} ghost={ghost} />
        </div>
      </div>
      <div className="cv-top">
        <span className="n-title">FLOW</span>
        <span className="n-count">{kept(draft).length} ACCTS · {shown.links.length} LINKS</span>
        <button type="button" className="n-go" onClick={close}>DONE ▸</button>
      </div>
      <Toolbar tool={tool} onTool={pickTool} zoom={cam.z} onUndo={undoGlide} onClear={clear} onZoom={zoomBy} onFit={() => { glide(); fit(); }} />
    </div>
  );
}
