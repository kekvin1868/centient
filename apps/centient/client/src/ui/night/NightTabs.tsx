// Tabs that glitch when they switch. ← → or Tab switch them from the owner's layer.
import type { ReactNode } from 'react';

export function NightTabs({ tabs, index, onChange, children }: { tabs: string[]; index: number; onChange: (i: number) => void; children: ReactNode }) {
  return (
    <>
      <div className="n-tabs" role="tablist">
        {tabs.map((t, i) => (
          <button key={t} type="button" role="tab" aria-selected={i === index} onClick={() => onChange(i)}>{t}</button>
        ))}
      </div>
      <div key={index} className="n-tabpanel" role="tabpanel" aria-label={tabs[index]}>{children}</div>
    </>
  );
}
