// MONTH CLEAR: the small dialog shown when the last open bill of the month is paid.
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../../lib/format';
import type { MonthRun } from '../../models/billRun';
import { NightSheet } from '../../ui/night/NightSheet';
import { usePresence } from '../../ui/night/tv';

export function MonthClear({ runs, onClose }: { runs: MonthRun[] | null; onClose: () => void }) {
  const open = runs !== null;
  const { mounted, gen, unmount } = usePresence(open);
  // Kept while the dialog plays its exit.
  const shown = useRef<MonthRun[]>([]);
  if (runs) shown.current = runs;
  const asked = useRef(open);
  asked.current = open;
  if (!mounted) return null;
  const late = shown.current.reduce((n, r) => n + r.latePaid, 0);
  return createPortal(
    <NightSheet
      key={gen}
      fixed
      open={open}
      place="mid"
      fx="glitch"
      label="Month clear"
      title="BILLS"
      onClose={() => {
        unmount();
        if (asked.current) onClose();
      }}
    >
      {close => (
        <>
          <div className="c-msg text-center">
            <p className="text-[30px] leading-tight [text-shadow:2px_0_0_var(--pink),-2px_0_0_var(--miku)]">
              MONTH CLEAR
            </p>
            {shown.current.map(r => (
              <p key={`clear:${r.currency}`} className="num mt-2 text-[15px]">
                {r.paid}/{r.count} paid · {formatMoney(r.total, r.currency)}
              </p>
            ))}
            <p className="mt-1 text-[15px]">{late ? `${late} paid late` : 'All on time'}</p>
          </div>
          <div className="k-acts !grid-cols-1">
            <button type="button" className="n-go" onClick={close}>
              OK
            </button>
          </div>
        </>
      )}
    </NightSheet>,
    document.body,
  );
}
