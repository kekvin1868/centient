// OVER THE LIMIT itself (see ./OverLimit): downloaded the first time a spend is over a card's limit, so Home's first
// paint does not carry it.
import { useState } from 'react';
import { isCard } from '../../../../src/domain/recurring';
import { amountInput, showAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { everyday } from '../../lib/state';
import { accountApi, shownBalance } from '../../models/account';
import { NightSheet } from '../../ui/night/NightSheet';
import type { Form } from './form';
import type { Short } from './OverLimit';

type Balance = { id: string; balance: number };

export function OverLimitSheet({
  form,
  short,
  balances,
  onBack,
  onDone,
}: {
  form: Form;
  short: Short;
  balances: Balance[];
  onBack: () => void;
  /** `trusted`: let it through without checking again (its limit was just raised). */
  onDone: (form: Form, trusted?: boolean) => void;
}) {
  const [step, setStep] = useState<'why' | 'limit' | 'other'>('why');
  const [limit, setLimit] = useState<number | null>(short.limit);
  const money = (n: number) => formatMoney(n, short.currency);
  const newLeft = Math.max(0, short.left + (limit ?? 0) - short.limit);
  // Every other account of this currency you can pay with: cards by limit left, the rest by balance.
  const choices = everyday()
    .filter(a => a.id !== form.accountId && a.currency_code === short.currency)
    .map(a => {
      const balance = balances.find(b => b.id === a.id)?.balance ?? 0;
      const left = shownBalance({ ...a, balance });
      return { a, left, covers: left >= short.spend };
    })
    // The ones that cover it first; among them cards first (the spend most likely went on another card).
    .sort(
      (x, y) =>
        Number(y.covers) - Number(x.covers) || Number(isCard(y.a.kind)) - Number(isCard(x.a.kind)),
    );
  const saveLimit = () =>
    attempt(async () => {
      await accountApi.update(form.accountId!, { credit_limit: limit });
      onDone(form, true);
    });

  return (
    <NightSheet
      fixed
      open
      place="mid"
      fx="glitch"
      label="Over the limit"
      title="OVER THE LIMIT"
      onClose={onBack}
    >
      {close => (
        <div className="c-msg">
          <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[16px]">
            <dt>This spend</dt>
            <dd className="text-right font-bold">{money(short.spend)}</dd>
            <dt>Left on card</dt>
            <dd className="text-right font-bold">
              {money(step === 'limit' ? newLeft : short.left)}
            </dd>
            <dt>Short by</dt>
            <dd className="text-right font-bold text-[#c2185b]">
              {money(Math.max(0, short.spend - (step === 'limit' ? newLeft : short.left)))}
            </dd>
          </dl>

          {step === 'why' && (
            <>
              <p className="mt-4 text-center font-bold">The bank let it through?</p>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  className="n-btn"
                  aria-label="My limit went up"
                  onClick={() => setStep('limit')}
                >
                  MY LIMIT WENT UP
                </button>
                <button
                  type="button"
                  className="n-btn"
                  aria-label="Paid with another"
                  onClick={() => setStep('other')}
                >
                  PAID WITH ANOTHER
                </button>
              </div>
            </>
          )}

          {step === 'limit' && (
            <div className="mt-4 grid gap-2">
              <label className="flex items-baseline gap-2">
                <span>{short.name} limit</span>
                <span className="flex-1" />
                <span className="num font-bold">
                  Rp
                  <input
                    aria-label="Limit"
                    inputMode="numeric"
                    autoFocus
                    value={showAmount(limit, short.currency)}
                    onChange={e =>
                      setLimit(amountInput(e.target.value.replace(/\D/g, ''), short.currency).minor)
                    }
                    className="ml-1 w-32 border-b-2 border-dotted border-current bg-transparent text-right [font-size:16px]"
                  />
                </span>
              </label>
              <button
                type="button"
                className="n-go"
                disabled={!limit || newLeft < short.spend}
                onClick={saveLimit}
              >
                Save limit & log
              </button>
            </div>
          )}

          {step === 'other' && (
            <div className="mt-4 grid gap-2" role="group" aria-label="Paid with another">
              {choices.map(({ a, left, covers }) => (
                <button
                  key={a.id}
                  type="button"
                  className="n-btn flex items-baseline justify-between gap-3 !px-3 text-left"
                  disabled={!covers}
                  onClick={() =>
                    onDone({
                      ...form,
                      accountId: a.id,
                      envelopeId: null,
                      plan: isCard(a.kind) ? form.plan : null,
                    })
                  }
                >
                  <span className="min-w-0 truncate">{a.name}</span>
                  <span className="num flex shrink-0 flex-col items-end whitespace-nowrap">
                    <span>{money(left)} left</span>
                    {!covers && <span className="text-[13px]">Not enough</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="mt-3 w-full text-center text-[14px] underline decoration-dotted underline-offset-4"
            onClick={() => void close()}
          >
            Go back
          </button>
        </div>
      )}
    </NightSheet>
  );
}
