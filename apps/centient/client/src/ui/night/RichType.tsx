// Text that types itself in letter by letter, VA-11 Hall-A style: punctuation holds the beat. Markup marks words:
// {pink|word} {cyan|word} {shake|word}. Key it by its text to start over; `skip` finishes the line at once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { reducedMotion } from '../../lib/motion';

type Char = [ch: string, style: string];

export function richChars(text: string): Char[] {
  const out: Char[] = [];
  text.replace(/\{(\w+)\|([^}]+)\}|([^{]+)/g, (_, style, word, plain) => {
    for (const ch of word ?? plain) out.push([ch, style ?? '']);
    return '';
  });
  return out;
}

const pause = (ch: string) => (/[.,!?]/.test(ch) ? 220 : ch === ' ' ? 18 : 34);

function Chars({ chars }: { chars: Char[] }) {
  return chars.map(([ch, style], i) => (
    <span key={i} className={style ? `rich-${style}` : undefined} style={style === 'shake' ? { animationDelay: `${-(i % 4) * 0.04}s` } : undefined}>{ch}</span>
  ));
}

/** The whole line at once, with its markup (guides, hints already read). */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`rich static ${className}`}><Chars chars={richChars(text)} /></span>;
}

export function RichType({ text, skip = false, onDone, className = '' }: { text: string; skip?: boolean; onDone?: () => void; className?: string }) {
  const chars = useMemo(() => richChars(text), [text]);
  const [n, setN] = useState(() => (reducedMotion() ? chars.length : 0));
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef(false);
  useEffect(() => {
    if (n >= chars.length) {
      if (!fired.current) { fired.current = true; done.current?.(); }
      return;
    }
    if (skip) { setN(chars.length); return; }
    const t = setTimeout(() => setN(n + 1), pause(chars[n][0]));
    return () => clearTimeout(t);
  }, [n, skip, chars]);
  return (
    <p className={`rich ${n < chars.length ? 'typing' : ''} ${className}`} aria-label={chars.map(c => c[0]).join('')}>
      <Chars chars={chars.slice(0, n)} />
    </p>
  );
}
