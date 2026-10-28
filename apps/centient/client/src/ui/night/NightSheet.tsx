// A night dialog over the current layer. It enters and leaves with one retro effect (TV, glitch or render;
// random each time unless `fx` is given) while the backdrop dims and undims. Escape, the title bar's close button (an old Windows one) or a tap on the dimmed
// backdrop closes it; focus stays inside while open.
// Children that close it get `close` (children as a function), so the exit animation always plays.
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useFx, type Fx } from './tv';
import { useLayerKeys } from './useLayers';

type Props = {
  label: string;
  /** Header strip: left text and right text. */
  title?: ReactNode;
  meta?: ReactNode;
  onClose: () => void;
  /** Keys other than Escape and Tab; `close` plays the exit first. */
  onKey?: (e: KeyboardEvent, close: () => Promise<void>) => void;
  place?: 'end' | 'mid';
  /** Controlled: turning false plays the exit, then onClose. */
  open?: boolean;
  /** Over the whole viewport (portaled to body) instead of over its scene. */
  fixed?: boolean;
  fx?: Fx;
  className?: string;
  children: ReactNode | ((close: () => Promise<void>) => ReactNode);
};

// Windows 98's close glyph, pixel for pixel.
const X = ['##....##', '.##..##.', '..####..', '...##...', '..####..', '.##..##.', '##....##'];
const X_PATH = X.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1h-1z` : ''))).join('');
const CloseGlyph = () => <svg viewBox="0 0 8 7" width="8" height="7" shapeRendering="crispEdges" aria-hidden="true"><path d={X_PATH} fill="currentColor" /></svg>;

const FOCUSABLE = 'button:not(:disabled), input, [tabindex]:not([tabindex="-1"])';

export function NightSheet({ label, title, meta, onClose, onKey, place = 'end', open = true, fixed = false, fx, className = '', children }: Props) {
  const { leaving, leave, cls } = useFx(fx);
  const box = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const done = useRef(onClose);
  done.current = onClose;
  const close = useCallback(async () => {
    if (closed.current) return;
    closed.current = true;
    await leave();
    done.current();
  }, [leave]);

  useEffect(() => { if (!open) close(); }, [open, close]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // A field that focused itself (autoFocus) keeps it; otherwise the dialog takes focus.
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  useLayerKeys(e => {
    if (closed.current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && box.current) {
      const all = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length;
      e.preventDefault();
      all[next].focus();
      return;
    }
    onKey?.(e, close);
  });

  return (
    <div className={`n-modal ${place} ${fixed ? 'fixed' : ''} ${leaving ? 'out' : ''}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`n-sheet ${cls} ${className}`}>
        {title !== undefined && (
          <div className="n-ph">
            <span>{title}</span>
            <span className="n-ph-end">{meta}<button type="button" className="n-x" aria-label="Close" onClick={close}><CloseGlyph /></button></span>
          </div>
        )}
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  );
}
