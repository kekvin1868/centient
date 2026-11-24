// A card or pay later bill on Home's "Coming up", drawn as an old parchment scroll that ages with every bill left
// unpaid in a row (`unpaidBills` from the server): 1 = a fresh yellow scroll, 2 = crumpled, 3 or more = torn and
// worn. All of the look is CSS (.bill-scroll in styles.css), so Home's first paint stays small.
import type { ReactNode } from 'react';

const AGE_WORDS = ['', 'This bill', '2 bills unpaid', '3+ bills unpaid'];

export function BillScroll({
  age,
  late,
  title,
  due,
  amount,
  onOpen,
}: {
  /** Bills unpaid in a row (1, 2, 3+). */
  age: number;
  late: boolean;
  title: string;
  due: string;
  amount: ReactNode;
  onOpen: () => void;
}) {
  const a = Math.min(3, Math.max(1, age));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bill-scroll"
      data-age={a}
      data-late={late || undefined}
      aria-label={`${title}, ${amount}, ${due}, ${AGE_WORDS[a].toLowerCase()}`}
    >
      <span className="bill-scroll-paper">
        <span className="min-w-0 flex-1">
          <span className="bill-scroll-title">{title}</span>
          <span className="bill-scroll-due">{due}</span>
          {a > 1 && <span className="bill-scroll-age">{AGE_WORDS[a]}</span>}
        </span>
        <span className="num bill-scroll-amount">{amount}</span>
      </span>
    </button>
  );
}
