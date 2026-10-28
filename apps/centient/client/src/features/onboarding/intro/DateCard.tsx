// A typed date card (DAY 1 / today / FRESH START), held for a beat, then glitched away.
import { useState } from 'react';
import { RichType } from '../../../ui/night/RichType';
import { wait } from '../../../ui/night/tv';

export function DateCard({ today, onDone }: { today: string; onDone: () => void }) {
  const [y, m, d] = today.split('-');
  const lines = ['DAY 1', `${m}.${d}.${y}`, '{pink|FRESH START}'];
  const [step, setStep] = useState(0);
  const [out, setOut] = useState(false);
  const next = async (i: number) => {
    if (i < lines.length - 1) { await wait(i === 1 ? 250 : 0); setStep(i + 1); return; }
    await wait(1100);
    setOut(true);
    await wait(420);
    onDone();
  };
  return (
    <div className="scene n-dark va-scene">
      <div className={`va-card ${out ? 'glitch-out' : ''}`}>
        {lines.slice(0, step + 1).map((t, i) => (
          <RichType key={i} text={t} className={i === 1 ? 'va-big' : 'va-k'} onDone={() => next(i)} />
        ))}
      </div>
    </div>
  );
}
