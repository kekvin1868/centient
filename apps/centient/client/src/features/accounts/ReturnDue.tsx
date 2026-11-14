// Home's reminder, between the hero and the log box: people whose tab is below zero (money you hold that is theirs).
// Three looks: owed back (warning, REVIEW), Kept until a day (grey, calm), and from that day on (warning, "Return
// today" / "N days late"). REVIEW opens that person on Money (Returned / Kept).
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '../../lib/format';
import { me, moneyPick } from '../../lib/state';
import { useBalances } from '../../models/useWaiting';
import { dateText } from '../../ui/Fields';
import { KeyChip } from '../../ui/KeyChip';

const DAY = 86_400_000;

/** What the strip says for a tab you owe: kept (before its day) or due (no day, or the day has come). */
export function returnState(keptUntil: string | null, today: string) {
  if (!keptUntil) return { kept: false, line: 'Money to give back' };
  if (keptUntil > today) return { kept: true, line: `Return by ${dateText(keptUntil)}` };
  const late = Math.round((Date.parse(today) - Date.parse(keptUntil)) / DAY);
  return {
    kept: false,
    line: late === 0 ? 'Return today' : `${late} day${late === 1 ? '' : 's'} late`,
  };
}

export function ReturnDue({ onGo }: { onGo: () => void }) {
  const { data } = useBalances();
  const today = me.value?.today ?? '';
  const due = data?.accounts.filter(a => a.kind === 'IOU' && a.balance < 0 && !a.archived_at);
  if (!due?.length) return null;
  return (
    <section className="mx-4 -mt-2 mb-5 flex flex-col gap-2" aria-label="Money to give back">
      {due.map(a => {
        const s = returnState(a.kept_until, today);
        return (
          <div
            key={a.id}
            className={`panel flex items-center gap-3 rounded-2xl px-3.5 py-3 ${s.kept ? 'bg-raised-2' : 'bg-warn/25'}`}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[15px] font-bold">{a.name}</span>
                {s.kept && <KeyChip state="KEPT" />}
              </span>
              <span className="block text-[13px] text-muted">{s.line}</span>
            </span>
            <button
              type="button"
              className="n-win shrink-0 px-2.5 py-1 text-[13px] font-bold"
              aria-label={`Review ${a.name}`}
              onClick={() => {
                moneyPick.value = a.id;
                onGo();
              }}
            >
              REVIEW
            </button>
            <span className="num shrink-0 text-[16px] font-extrabold">
              {formatMoney(-a.balance, a.currency_code)}
            </span>
          </div>
        );
      })}
    </section>
  );
}
