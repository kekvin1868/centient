// One screen's frame: the scroll area above the tab bar, with the screen's large title when it has one, and an
// optional control at the title's far right (Insights' `?`). A page inside a screen (see useSubPage) passes
// `back`: a key above the title, and the frame renders in from the top.
import type { ReactNode } from 'react';

/** The key back out of a page inside a screen; `label` names where it goes ("Bills"). */
export type Back = { label: string; onBack: () => void };

export function Page({
  title,
  action,
  back,
  children,
}: {
  title?: string;
  action?: ReactNode;
  back?: Back;
  children?: ReactNode;
}) {
  return (
    <main className={back ? 'screen fx-in-render' : 'screen'}>
      {back && (
        <button
          type="button"
          aria-label={`Back to ${back.label}`}
          className="ml-4 min-h-9 pr-3 text-[13px] uppercase text-muted active:opacity-60"
          onClick={back.onBack}
        >
          ‹ {back.label}
        </button>
      )}
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
