// A sheet that is downloaded the first time it opens, for sheets reached from Home (its first paint has a
// size budget). After that it stays mounted, so closing it plays the sheet's own exit.
import { lazy, Suspense, useRef, type ComponentType } from 'react';

export function lazySheet<P extends { open: boolean }>(load: () => Promise<ComponentType<P>>) {
  const Loaded = lazy(() => load().then(component => ({ default: component })));
  return function LazySheet(props: P) {
    const opened = useRef(false);
    opened.current ||= props.open;
    if (!opened.current) return null;
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}
