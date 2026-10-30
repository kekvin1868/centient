// A small bevelled button in the dialogs' old Windows title-bar style (.n-win), for help (?) and similar
// actions beside a heading. The look comes from night.css only.
import type { ReactNode } from 'react';

export function WinButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="n-win" aria-label={label} onClick={onClick}>{children}</button>;
}
