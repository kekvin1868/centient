// Three screens in a game-menu tab bar: icon over a display-font label, the current screen on a slanted
// Miku plate (Borderlands menu tabs). Every tab has the same box, so nothing shifts between screens.
import { GearSix, House, Wallet, type Icon } from '@phosphor-icons/react';
import { buzz } from '../lib/motion';

export type Screen = 'home' | 'money' | 'settings';

const TABS: { screen: Screen; label: string; icon: Icon }[] = [
  { screen: 'home', label: 'Home', icon: House },
  { screen: 'money', label: 'Money', icon: Wallet },
  { screen: 'settings', label: 'Settings', icon: GearSix },
];

export function BottomNav({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-ios-light-surface pb-safe dark:bg-ios-dark-surface">
      <div className="mx-auto flex h-16 max-w-[640px] gap-2 px-3 py-1.5">
        {TABS.map(({ screen, label, icon: I }) => {
          const on = screen === current;
          return (
            <button key={screen} type="button" aria-current={on ? 'page' : undefined} onClick={() => { if (!on) buzz(); onGo(screen); }}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 ${on ? 'text-[#0b0f0f]' : 'text-muted active:opacity-60'}`}>
              <span aria-hidden="true" className={`absolute inset-0 -skew-x-12 rounded-lg bg-miku transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] ${on ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`} />
              <I className="relative" size={24} weight={on ? 'fill' : 'bold'} aria-hidden="true" />
              <span className="relative text-[12px] font-semibold leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
