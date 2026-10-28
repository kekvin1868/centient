// A guide note that types in after a quiet spell, once per `id` for the whole run. Any tap or key switches it
// off like a TV and it doesn't come back.
import { useEffect, useState } from 'react';
import { CoinMark } from '../Logo';
import { RichType } from './RichType';

const seen = new Set<string>();
/** A fresh run (first sign-in, after a reset) shows every hint again. */
export const resetHints = () => seen.clear();

export function IdleHint({ id, text, top = false, ms = 8000 }: { id: string; text: string; top?: boolean; ms?: number }) {
  const [shown, setShown] = useState(false);
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (shown || seen.has(id)) return;
    let t = 0;
    const arm = () => { clearTimeout(t); t = window.setTimeout(() => { seen.add(id); setShown(true); }, ms); };
    arm();
    document.addEventListener('pointerdown', arm, true);
    document.addEventListener('keydown', arm, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', arm, true); document.removeEventListener('keydown', arm, true); };
  }, [id, shown, ms]);
  useEffect(() => {
    if (!shown || off) return;
    const dismiss = () => setOff(true);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', dismiss, true); };
  }, [shown, off]);
  useEffect(() => {
    if (!off) return;
    const t = setTimeout(() => setShown(false), 330);
    return () => clearTimeout(t);
  }, [off]);
  if (!shown) return null;
  return (
    <div className={`n-hint ${top ? 'top' : ''} ${off ? 'off' : ''}`} role="status">
      <span className="n-tab"><CoinMark />GUIDE</span>
      <RichType text={text} />
    </div>
  );
}
