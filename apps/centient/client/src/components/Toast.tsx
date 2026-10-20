// One toast at a time, above the bottom nav. An action (Undo) keeps it up for its full duration.
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { popIn } from '../lib/motion';

type ToastState = { id: number; message: string; action?: { label: string; run: () => void }; ms: number; onExpire?: () => void };
export const toast = signal<ToastState | null>(null);
let seq = 0;

/** Shows a message; `onExpire` runs when it times out without the action being used. */
export function showToast(message: string, opts: { action?: ToastState['action']; ms?: number; onExpire?: () => void } = {}) {
  const prev = toast.value;
  prev?.onExpire?.(); // a replaced toast counts as expired, so a pending delete still happens
  toast.value = { id: ++seq, message, action: opts.action, ms: opts.ms ?? (opts.action ? 5000 : 2500), onExpire: opts.onExpire };
}

export function Toast() {
  const t = toast.value;
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!t) return;
    if (el.current) popIn(el.current);
    const timer = setTimeout(() => {
      if (toast.value?.id !== t.id) return;
      toast.value = null;
      t.onExpire?.();
    }, t.ms);
    return () => clearTimeout(timer);
  }, [t?.id]);
  if (!t) return null;
  return (
    <div class="toast" ref={el} role="status" aria-live="polite">
      <span class="toast-msg">{t.message}</span>
      {t.action && (
        <button class="btn btn-plain" onClick={() => { const a = t.action!; toast.value = null; a.run(); }}>{t.action.label}</button>
      )}
    </div>
  );
}
