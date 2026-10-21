// Three screens in a Konsta tab bar. Phosphor icons: filled for the current screen, regular for the rest.
import { GearSix, House, Wallet, type Icon } from '@phosphor-icons/react';
import { Tabbar, TabbarLink } from 'konsta/react';

export type Screen = 'home' | 'money' | 'settings';

const TABS: { screen: Screen; label: string; icon: Icon }[] = [
  { screen: 'home', label: 'Home', icon: House },
  { screen: 'money', label: 'Money', icon: Wallet },
  { screen: 'settings', label: 'Settings', icon: GearSix },
];

export function BottomNav({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  return (
    <Tabbar labels icons className="fixed left-0 bottom-0 z-30" aria-label="Main">
      {TABS.map(({ screen, label, icon: I }) => (
        <TabbarLink key={screen} active={screen === current} aria-current={screen === current ? 'page' : undefined} onClick={() => onGo(screen)}
          icon={<I size={26} weight={screen === current ? 'fill' : 'regular'} aria-hidden="true" />} label={label} />
      ))}
    </Tabbar>
  );
}
