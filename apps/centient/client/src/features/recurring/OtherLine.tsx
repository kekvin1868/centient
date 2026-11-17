// A card bill or an installment on the Bills page: tagged, outside the month's bar, with its own quiet PAY… key
// (the screen opens the card's pay dialog or the plan).
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import type { OtherDue } from '../../models/billRun';
import { openWords } from './BillLine';

export const otherName = (o: OtherDue) =>
  o.plan
    ? `${o.plan.name} · ${o.plan.no} of ${o.plan.of}`
    : `${nameOf(catalog.value.accounts, o.accountId)} bill`;

export function OtherLine({
  due,
  today,
  onPay,
}: {
  due: OtherDue;
  today: string;
  onPay: () => void;
}) {
  const name = otherName(due);
  const currency = catalog.value.accounts.find(a => a.id === due.accountId)?.currency_code;
  return (
    <li className="flex min-h-14 items-center gap-2.5 border-b border-edge py-2 pl-2.5 pr-2.5 last:border-b-0">
      <span aria-hidden="true" className="text-[20px] leading-none">
        {due.kind === 'CARD' ? '💳' : '📦'}
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
