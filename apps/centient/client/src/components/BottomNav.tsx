// Three screens. Phosphor icons: filled for the current screen, regular for the rest (iOS tab bar style).
import { GearSix, House, Wallet, type Icon } from '@phosphor-icons/react';

export type Screen = 'home' | 'money' | 'settings';

const TABS: { screen: Screen; label: string; icon: Icon }[] = [
  { screen: 'home', label: 'Home', icon: House },
  { screen: 'money', label: 'Money', icon: Wallet },
  { screen: 'settings', label: 'Settings', icon: GearSix },
];

export function BottomNav({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  return (
    <nav class="nav" aria-label="Main">
      {TABS.map(({ screen, label, icon: I }) => (
        <button type="button" aria-current={screen === current ? 'page' : undefined} onClick={() => onGo(screen)}>
          <I size={26} weight={screen === current ? 'fill' : 'regular'} aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}
