// The sub-card under the money hero (Home on All accounts, and Money): credit cards and pay later, one row per kind,
// apart from your money. A card's balance is its debt (below zero = owed); with a limit set, left to spend =
// limit + balance, drawn as an HP bar that drains as you spend. Without one, only what is owed shows.
import { formatMoney } from '../../lib/format';
import { idrValue } from '../../lib/prices';
import { usePrices } from '../../models/price';
import { HpBar } from '../../ui/HpBar';
import type { Held } from './TotalBalance';

type Card = Held & { credit_limit: number | null };

const KINDS = [
  { kind: 'CREDIT_CARD', label: 'Credit card', many: 'credit cards' },
  { kind: 'PAYLATER', label: 'Pay later', many: 'pay later accounts' },
] as const;

/** Per kind with an account: owed, and for the accounts with a limit, the limit and what is left of it (rupiah). */
export function limitRows(accounts: Card[], idr: (minor: number, currency: string) => number) {
  return KINDS.flatMap(k => {
    const own = accounts.filter(a => a.kind === k.kind);
    if (!own.length) return [];
    const capped = own.filter(a => a.credit_limit);
    const sum = (xs: Card[], f: (a: Card) => number) =>
      xs.reduce((s, a) => s + idr(f(a), a.currency_code), 0);
    return [
      {
        ...k,
        count: own.length,
        owed: sum(own, a => Math.max(0, -a.balance)),
        limit: sum(capped, a => a.credit_limit!),
        left: sum(capped, a => a.credit_limit! + a.balance),
        unset: own.length - capped.length,
      },
    ];
  });
}

/** `onGo`: the hint becomes a link (Home goes to Money, where the account's settings are). */
export function CardLimits({ accounts, onGo }: { accounts: Card[]; onGo?: () => void }) {
  const p = usePrices();
  const rows = limitRows(accounts, (v, c) => idrValue(v, c, p) ?? 0);
  if (!rows.length) return null;
  return (
    <section
      className="panel relative mx-4 mb-5 rounded-[20px] bg-raised px-4 pt-3 pb-4"
      aria-label="Cards and pay later"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">Cards &amp; pay later</h3>
        <span className="shrink-0 rotate-2 rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-raised">
          Not your money
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-4">
        {rows.map(r => (
          <li key={r.kind}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-bold uppercase tracking-wider text-muted">
                {r.label}
                {r.count > 1 ? ` · ${r.count}` : ''}
              </span>
            </div>
            {r.limit > 0 ? (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`num text-[24px] font-bold ${r.left <= 0 ? 'text-negative' : ''}`}
                  >
                    {formatMoney(Math.max(0, r.left))}
                  </span>
                  <span className="text-[14px] text-muted">left to spend</span>
                </div>
                <div className="mt-2">
                  <HpBar value={Math.max(0, r.left)} max={r.limit} size="big" />
                </div>
                <p className="mt-1.5 text-[14px] text-muted">
                  Used <span className="num font-bold text-ink">{formatMoney(r.owed)}</span> of{' '}
                  <span className="num">{formatMoney(r.limit)}</span>
                  {r.unset > 0 && ` · ${r.unset} without a limit`}
                </p>
              </>
            ) : (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="num text-[24px] font-bold">{formatMoney(r.owed)}</span>
                  <span className="text-[14px] text-muted">owed</span>
                </div>
                {(() => {
                  const hint = `Set the limit in the ${r.count > 1 ? r.many : 'account'}'s settings to see what is left`;
                  return onGo ? (
                    <button
                      type="button"
                      onClick={onGo}
                      className="mt-1 text-left text-[14px] font-semibold text-muted active:opacity-70"
                    >
                      {hint} ▸
                    </button>
                  ) : (
                    <p className="mt-1 text-[14px] text-muted">{hint}.</p>
                  );
                })()}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
