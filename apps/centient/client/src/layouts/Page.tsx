// One screen's frame: the scroll area above the tab bar, with the screen's large title when it has one, and an
// optional control at the title's far right (Insights' `?`).
import type { ReactNode } from 'react';

export function Page({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="screen">
      {title &&
        (action ? (
          <div className="flex items-center justify-between gap-3 pr-4">
            <h1 className="screen-title">{title}</h1>
            {action}
          </div>
        ) : (
          <h1 className="screen-title">{title}</h1>
        ))}
      {children}
    </main>
  );
}
