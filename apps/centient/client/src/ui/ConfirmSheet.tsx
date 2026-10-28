// Our own confirm prompt (never the browser's), for destructive actions: a small retro dialog that glitches in.
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { NightSheet } from './night/NightSheet';
import { usePresence } from './night/tv';

type Props = { open: boolean; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void };

export function ConfirmSheet({ open, message, confirmLabel, onConfirm, onCancel }: Props) {
  const { mounted, gen, unmount } = usePresence(open);
  const asked = useRef(open);
  asked.current = open;
  if (!mounted) return null;
  return createPortal(
    <NightSheet key={gen} fixed open={open} place="mid" fx="glitch" label={message} title="CONFIRM"
      onClose={() => { unmount(); if (asked.current) onCancel(); }}>
      {close => (
        <>
          <p className="c-msg">{message}</p>
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={close}>CANCEL</button>
            <button type="button" className="n-go" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </>
      )}
    </NightSheet>,
    document.body,
  );
}
