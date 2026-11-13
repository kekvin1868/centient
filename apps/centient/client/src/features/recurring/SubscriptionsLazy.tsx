// The Subscriptions screen, downloaded the first time it opens (Home and Money both open it, and Home's first
// paint has a size budget).
import { lazy, Suspense, useRef } from 'react';

const Subscriptions = lazy(() =>
  import('./Subscriptions').then(m => ({ default: m.Subscriptions })),
);

export function SubscriptionsLazy({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Stays mounted after the first open, so closing plays the sheet's exit.
  const opened = useRef(false);
  opened.current ||= open;
  if (!opened.current) return null;
  return (
    <Suspense fallback={null}>
      <Subscriptions open={open} onClose={onClose} />
    </Suspense>
  );
}
