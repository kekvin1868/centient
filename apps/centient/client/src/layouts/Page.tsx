// One screen's frame: the scroll area above the tab bar, with the screen's large title when it has one.
import type { ReactNode } from 'react';

export function Page({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="screen">
      {title && <h1 className="screen-title">{title}</h1>}
      {children}
    </main>
  );
}
