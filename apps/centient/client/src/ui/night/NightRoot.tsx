// The first run's full-screen frame (the theme itself loads app-wide from ui/night/theme).
import type { ReactNode } from 'react';

export function NightRoot({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`night ${className}`}>
      {children}
      <div className="n-scan" aria-hidden="true" />
    </div>
  );
}
