// One toast at a time (Konsta Toast), above the tab bar. An action (Undo) keeps it up for its full duration.
import { signal } from '@preact/signals-react';
import { Button, Toast as KToast } from 'konsta/react';
import { useEffect, useRef } from 'react';

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
  const last = useRef<ToastState | null>(null); // keeps the text on screen while it slides away
  if (t) last.current = t;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => {
      if (toast.value?.id !== t.id) return;
      toast.value = null;
      t.onExpire?.();
    }, t.ms);
    return () => clearTimeout(timer);
  }, [t?.id]);
  const shown = last.current;
  return (
    <KToast opened={Boolean(t)} position="center" role="status" aria-live="polite"
      className="mb-24"
      button={shown?.action && (
        <Button clear inline onClick={() => { const a = shown.action!; toast.value = null; a.run(); }}>{shown.action.label}</Button>
      )}>
      <span className="shrink">{shown?.message}</span>
    </KToast>
  );
}
