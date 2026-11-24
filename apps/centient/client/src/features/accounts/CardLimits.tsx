// The sub-card under the money hero (Home on All accounts, and Money): credit cards and pay later, one row per kind,
// apart from your money. A card's balance is its debt (below zero = owed); with a limit set, left to spend =
// limit + balance, drawn as an HP bar that drains as you spend. Without one, only what is owed shows.
import type { Account } from '../../../../src/repos/accounts';
import { formatMoney } from '../../lib/format';
import { idrValue } from '../../lib/prices';
import { usePrices } from '../../models/price';
import { HpBar } from '../../ui/HpBar';
import { ICON } from './kindIcons';
import { limitRows, type Held } from '../../models/account';

/** `onGo`: the hint becomes a link (Home goes to Money, where the account's settings are). */
export function CardLimits({
  accounts,
  onGo,
}: {
  accounts: (Held & Pick<Account, 'credit_limit'>)[];
  onGo?: () => void;
}) {
  const p = usePrices();
  const rows = limitRows(accounts, (v, c) => idrValue(v, c, p) ?? 0);
  if (!rows.length) return null;
  return (
    <section
      className="panel relative mx-4 mb-5 rounded-[20px] bg-raised px-4 py-4"
      aria-label="Cards and pay later"
    >
      <ul className="flex flex-col gap-5">
        {rows.map(r => {
          const I = ICON[r.kind]!;
          return (
            <li key={r.kind} className={`rarity-${r.kind}`}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-[var(--rarity)] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#0b0f0f]">
                <I size={14} weight="fill" aria-hidden="true" />
                {r.label}
                {r.count > 1 ? ` · ${r.count}` : ''}
              </span>
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
                  {r.over > 0 && (
                    <p className="text-[14px] font-semibold text-negative">
                      Over by <span className="num">{formatMoney(r.over)}</span>
                    </p>
                  )}
                  <div className="mt-2">
                    <HpBar
                      value={Math.max(0, r.left)}
                      max={r.limit}
                      size="big"
                      fill="bg-[var(--rarity)]"
                    />
                  </div>
                  <p className="mt-1.5 text-[14px] text-muted">
                    Used <span className="num font-bold text-ink">{formatMoney(r.owed)}</span> of{' '}
                    <span className="num">{formatMoney(r.limit)}</span>
                    {r.unset > 0 &&
                      ` · + ${formatMoney(r.unsetOwed)} on ${r.unset} without a limit`}
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="num text-[24px] font-bold">{formatMoney(r.unsetOwed)}</span>
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
          );
        })}
      </ul>
    </section>
  );
}
