// Bottom sheet on Konsta's Sheet: slides up, closes on the backdrop, Escape, Done, or dragging it down.
// Callers mount it when there is something to show; it plays its own way in and out.
import { Link, Sheet as KSheet } from 'konsta/react';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';

type Props = { open: boolean; onClose: () => void; title?: string; children: ComponentChildren };
const OUT_MS = 400; // Konsta's sheet transition (duration-400)

export function Sheet({ open, onClose, title, children }: Props) {
  // Preact does not pass `ref` into Konsta components, so we hold the scroller and find the sheet from it.
  const scroller = useRef<HTMLDivElement>(null);
  const sheetEl = () => scroller.current?.closest<HTMLElement>('.k-sheet') ?? null;
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(open);

  // Mount closed, then open on the next frame so the slide-in transition runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(f);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), OUT_MS);
    return () => clearTimeout(t);
  }, [open]);

  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setTimeout(() => { closing.current = false; onClose(); }, OUT_MS);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  // Drag down to close while the sheet is scrolled to the top. The pointer is captured only once it
  // moves, since capturing on press sends the click to the sheet instead of what was tapped.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (!scroller.current || scroller.current.scrollTop > 0 || (e.target as Element).closest('input, textarea, select')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    const el = sheetEl();
    if (!drag.current || !el) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    if (drag.current.dy <= 4) return;
    if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
    el.style.transform = `translateY(calc(-100% + ${drag.current.dy}px))`;
  };
  const onPointerUp = () => {
    const el = sheetEl();
    if (!drag.current || !el) return;
    const { dy, t } = drag.current;
    drag.current = null;
    el.style.transition = '';
    el.style.transform = '';
    const fast = dy / (performance.now() - t) > 0.6; // px per ms: a flick closes even when short
    if (dy > 120 || (fast && dy > 30)) close();
  };

  if (!mounted) return null;
  // Portaled to <body> so no transformed screen becomes the fixed sheet's containing block.
  return createPortal(
    <KSheet opened={shown} onBackdropClick={close} role="dialog" aria-modal="true" aria-label={title}
      className="w-full max-w-[640px] mx-auto touch-pan-y"
      colors={{ bgIos: 'bg-ios-light-surface dark:bg-ios-dark-surface' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div ref={scroller} class="max-h-[92dvh] overflow-auto pb-safe">
      <button class="block mx-auto mt-2 mb-1 h-[5px] w-10 rounded-full bg-black/20 dark:bg-white/25" aria-label="Close" onClick={close} />
      {title && (
        <div class="flex items-center justify-between px-4 pt-2">
          <span class="text-xl font-bold truncate">{title}</span>
          <Link onClick={close}>Done</Link>
        </div>
      )}
      <div class="pb-6">{children}</div>
      </div>
    </KSheet>,
    document.body,
  );
}
