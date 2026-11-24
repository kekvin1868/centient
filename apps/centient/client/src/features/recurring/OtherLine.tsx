// A card bill on the Bills page: tagged, outside the month's bar. The row opens the card's bill (its lines, I paid
// it); its own quiet PAY… key goes straight to the pay dialog.
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import type { OtherDue } from '../../models/billRun';
import { openWords } from './BillLine';

export const otherName = (o: OtherDue) => `${nameOf(catalog.value.accounts, o.accountId)} bill`;

export function OtherLine({
  due,
  today,
  onOpen,
  onPay,
}: {
  due: OtherDue;
  today: string;
  onOpen: () => void;
  onPay: () => void;
}) {
  const name = otherName(due);
  const currency = catalog.value.accounts.find(a => a.id === due.accountId)?.currency_code;
  return (
    <li className="flex min-h-14 items-center gap-2.5 border-b border-edge py-2 pl-2.5 pr-2.5 last:border-b-0">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left active:opacity-60"
        aria-label={`${name}, ${formatMoney(due.amount, currency)}, ${openWords(due.due, today)}`}
        onClick={onOpen}
      >
        <span aria-hidden="true" className="text-[20px] leading-none">
          💳
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[15px]">
            <span className="truncate">{name}</span>
            <span className="border border-edge px-1 text-[10px] text-muted">{due.kind}</span>
          </span>
          <span className={`truncate text-[12px] ${due.late ? 'text-negative' : 'text-muted'}`}>
            {openWords(due.due, today)} · not in the bar
          </span>
        </span>
        <span className="num shrink-0 text-[14px] font-extrabold">
          {formatMoney(due.amount, currency)}
        </span>
      </button>
      <button
        type="button"
        className="keycap keycap-quiet !rounded-[3px] !text-[12px]"
        aria-label={`Pay ${name}`}
        onClick={onPay}
      >
        PAY…
      </button>
    </li>
  );
}
