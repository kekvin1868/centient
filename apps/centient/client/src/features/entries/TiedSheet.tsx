// Deleting or shrinking a split bill that people already paid back: lists those Paid backs and asks what happened to
// the money. Never received = they shrink by this bill's part. Return money = you keep it and owe it back (Home strip).
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../../lib/format';
import { dateText } from '../../ui/Fields';
import { catalog, nameOf } from '../../lib/state';
import type { BillPerson, PaybackMode } from '../../models/entry';
import { NightSheet } from '../../ui/night/NightSheet';
import { usePresence } from '../../ui/night/tv';

type Props = {
  open: boolean;
  /** "Delete Patungan Kulkas?" / "Save Patungan Kulkas?" */
  title: string;
  people: BillPerson[];
  currency: string;
  onPick: (mode: PaybackMode) => void;
  onCancel: () => void;
};

export function TiedSheet({ open, title, people, currency, onPick, onCancel }: Props) {
  const { mounted, gen, unmount } = usePresence(open);
  const asked = useRef(open);
  asked.current = open;
  if (!mounted) return null;
  const paid = people.flatMap(p =>
    p.paybacks.map(b => ({ ...b, name: nameOf(catalog.value.accounts, p.tabId) })),
  );
  return createPortal(
    <NightSheet
      key={gen}
      fixed
      open={open}
      place="mid"
      fx="glitch"
      label={title}
      title="PAID BACK"
      onClose={() => {
        unmount();
        if (asked.current) onCancel();
      }}
    >
      {close => (
        <>
          <p className="c-msg">
            {title}
            <br />
            <span className="text-[15px] opacity-80">Already paid back on this bill:</span>
          </p>
          <ul className="c-body">
            {paid.map(p => (
              <li key={`${p.entryId}:${p.name}`} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="num font-bold">{formatMoney(p.amount, currency)}</span>
                <span className="text-[13px] opacity-70">{dateText(p.date)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
            <button type="button" className="n-go wide" onClick={() => onPick('NEVER_RECEIVED')}>
              NEVER RECEIVED
            </button>
            <button type="button" className="n-btn" onClick={() => onPick('RETURN')}>
              RETURN MONEY
            </button>
            <button type="button" className="n-btn" onClick={close}>
              CANCEL
            </button>
          </div>
        </>
      )}
    </NightSheet>,
    document.body,
  );
}
