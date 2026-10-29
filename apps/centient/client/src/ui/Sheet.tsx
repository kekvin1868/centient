// The app's dialog: the retro NightSheet (title bar with an old Windows close button, a random TV / glitch /
// render on the way in and out) over the whole screen. Closes on the backdrop, Escape or the close
// button; a parent setting `open` false gets the exit animation too. `onClosed` runs once it is gone either way
// (and has handed focus back), so a sheet opened from this one starts after it.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NightSheet } from './night/NightSheet';
import { usePresence } from './night/tv';

type Props = { open: boolean; onClose: () => void; onClosed?: () => void; title?: string; children: ReactNode };

export function Sheet({ open, onClose, onClosed, title, children }: Props) {
  const { mounted, gen, unmount } = usePresence(open);
  const asked = useRef(open);
  asked.current = open;
  // Runs after the dialog's own unmount clean-up, which hands focus back.
  const shown = useRef(mounted);
  useEffect(() => { if (shown.current && !mounted) onClosed?.(); shown.current = mounted; }, [mounted]);
  if (!mounted) return null;
  // Portaled to <body> so no transformed screen becomes the fixed dialog's containing block.
  return createPortal(
    <NightSheet key={gen} fixed open={open} label={title ?? 'Dialog'} title={title ?? ''} className="app-sheet"
      onClose={() => { unmount(); if (asked.current) onClose(); }}>
      <div className="app-sheet-body">{children}</div>
    </NightSheet>,
    document.body,
  );
}
