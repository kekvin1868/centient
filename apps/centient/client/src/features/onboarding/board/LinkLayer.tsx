// Arrows and pen strokes over the frames. New marks draw themselves in (a stroke drawn live doesn't); removed
// ones glitch out before they go, whether erased, cleared or undone.
import { useLayoutEffect, useRef, useState } from 'react';
import { reducedMotion } from '../../../lib/motion';

export type Mark = { id: string; d: string; kind: 'link' | 'ink' };

function Path({ mark, instant }: { mark: Mark; instant: boolean }) {
  const [settled, setSettled] = useState(instant || reducedMotion());
  const cls = mark.kind === 'link' ? 'cv-link' : 'cv-ink';
  return (
    <g data-mark={mark.id}>
      <path className={settled ? cls : `${cls} born`} d={mark.d} pathLength={settled ? undefined : 1}
        markerEnd={settled && mark.kind === 'link' ? 'url(#cv-arrow)' : undefined} onAnimationEnd={() => setSettled(true)} />
      <path className="cv-hit" d={mark.d} />
    </g>
  );
}

export function LinkLayer({ marks, live, ghost }: { marks: Mark[]; live: string | null; ghost: string | null }) {
  const prev = useRef(new Map<string, Mark>());
  const [leaving, setLeaving] = useState<Mark[]>([]);
  useLayoutEffect(() => {
    const now = new Map(marks.map(m => [m.id, m]));
    const gone = [...prev.current.values()].filter(m => !now.has(m.id));
    prev.current = now;
    if (!gone.length) return;
    setLeaving(l => [...l, ...gone]);
    setTimeout(() => setLeaving(l => l.filter(m => !gone.includes(m))), reducedMotion() ? 0 : 310);
  }, [marks]);
  return (
    <svg className="cv-svg" aria-hidden="true">
      <defs>
        <marker id="cv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="cv-arrowhead" />
        </marker>
      </defs>
      {marks.map(m => <Path key={m.id} mark={m} instant={m.id === live} />)}
      {leaving.map(m => (
        <g key={`gone:${m.id}`} className="gone"><path className={m.kind === 'link' ? 'cv-link' : 'cv-ink'} d={m.d} /></g>
      ))}
      {ghost && <path className="cv-link cv-ghost" d={ghost} markerEnd="url(#cv-arrow)" />}
    </svg>
  );
}
