// Wraps a save in the over-the-limit check (./OverLimit). OVER THE LIMIT itself is downloaded the first time a
// spend is over, not with Home's first paint.
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBalances } from '../../models/useWaiting';
import type { Form } from './form';
import { shortOf, type Before, type Short } from './OverLimit';

const OverLimitSheet = lazy(() =>
  import('./OverLimitSheet').then(m => ({ default: m.OverLimitSheet })),
);

/**
 * Wraps a save: `gate(forms, go)` saves at once when every spend fits; else OVER THE LIMIT opens for the first one
 * that doesn't, and `go` runs with that form changed (another account, or the same after a new limit). Render
 * `sheet` next to the caller's UI.
 */
export function useLimitGate(before?: Before) {
  const { data } = useBalances();
  type Ask = {
    forms: Form[];
    at: number;
    go: (forms: Form[]) => void;
    passed: Set<number>;
    short: Short;
  };
  const [ask, setAsk] = useState<Ask | null>(null);
  /** `passed`: forms already let through (a limit just raised: the phone's copy may not have it yet). */
  const gate = (forms: Form[], go: (forms: Form[]) => void, passed = new Set<number>()) => {
    // Resolves true when OVER THE LIMIT asks (nothing saved yet), false when it went straight to `go`.
    return Promise.resolve().then(
      // ponytail: a promise only so callers can tell whether it asked; the check itself is instant.
      () => {
        const at = forms.findIndex((f, i) => !passed.has(i) && shortOf(f, data?.accounts, before));
        if (at < 0) {
          go(forms);
          return false;
        }
        setAsk({ forms, at, go, passed, short: shortOf(forms[at], data?.accounts, before)! });
        return true;
      },
      () => {
        go(forms);
        return false;
      },
    );
  };
  const short = ask?.short;
  const sheet: ReactNode =
    ask && short
      ? createPortal(
          <Suspense fallback={null}>
            <OverLimitSheet
              form={ask.forms[ask.at]}
              short={short}
              balances={data?.accounts ?? []}
              onBack={() => setAsk(null)}
              onDone={(form, trusted) => {
                const forms = ask.forms.map((f, i) => (i === ask.at ? form : f));
                setAsk(null);
                void gate(forms, ask.go, trusted ? new Set([...ask.passed, ask.at]) : ask.passed);
              }}
            />
          </Suspense>,
          document.body,
        )
      : null;
  return { gate, sheet };
}
