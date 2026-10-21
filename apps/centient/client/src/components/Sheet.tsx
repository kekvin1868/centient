// Bottom sheet: slides up, closes on the scrim, Escape, or dragging it down past a threshold.
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { sheetIn, sheetOut } from '../lib/motion';

type Props = { open: boolean; onClose: () => void; title?: string; children: ComponentChildren };

export function Sheet({ open, onClose, title, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = async () => {
    if (closing.current || !sheet.current || !scrim.current) return;
    closing.current = true;
    await sheetOut(sheet.current, scrim.current);
    closing.current = false;
    onClose();
  };

  useEffect(() => {
    if (!open || !sheet.current || !scrim.current) return;
    sheetIn(sheet.current, scrim.current);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  // Drag down to close: follow the finger while the sheet is scrolled to the top. The pointer is
  // captured only once it moves, since capturing on press sends the click to the sheet, not the target.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (!sheet.current || sheet.current.scrollTop > 0 || (e.target as Element).closest('input, textarea, select, button:not(.sheet-grip)')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !sheet.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    if (drag.current.dy > 4 && !sheet.current.hasPointerCapture(e.pointerId)) sheet.current.setPointerCapture(e.pointerId);
    sheet.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !sheet.current) return;
    const { dy, t } = drag.current;
    drag.current = null;
    const fast = dy / (performance.now() - t) > 0.6; // px per ms: a flick closes even when short
    if (dy > 120 || (fast && dy > 30)) close();
    else {
      sheet.current.style.transition = 'transform 200ms var(--ease)';
      sheet.current.style.transform = '';
      setTimeout(() => sheet.current && (sheet.current.style.transition = ''), 220);
    }
  };

  if (!open) return null;
  return createPortal(
    <>
      <div class="scrim" ref={scrim} onClick={close} />
      <div class="sheet" ref={sheet} role="dialog" aria-modal="true" aria-label={title}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <button class="sheet-grip" aria-label="Close" onClick={close} />
        {title && <div class="sheet-head"><span class="sheet-title">{title}</span><button class="btn btn-plain" onClick={close}>Done</button></div>}
        {children}
      </div>
    </>,
    document.body,
  );
}
