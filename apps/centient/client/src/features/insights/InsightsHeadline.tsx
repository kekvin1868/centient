// The Insights headline card: spending, how it compares with the period before, income and the savings rate.
// No income reads "404 Income Error"; spending over income sets off the nuclear alarm.
import { BigMoney } from '../../ui/BigMoney';
import { NuclearSign } from '../../ui/NuclearSign';
import { formatMoney } from '../../lib/format';
import { comparisonLine, savingsView, type Span } from './insights';

type Props = {
  currency: string;
  spending: number;
  income: number;
  savingsRate: number | null;
  previous: Span & { spending: number; basis: 'SAME_DAYS' | 'FULL' };
};

export function InsightsHeadline({ currency, spending, income, savingsRate, previous }: Props) {
  const rate = savingsView(savingsRate);
  return (
    <section className="panel mx-4 bg-raised p-4" aria-label="Totals">
      <p className="text-sm text-muted">Spending</p>
      <BigMoney minor={spending} currency={currency} max={44} inset={64} />
      <p className="mt-1 text-[15px]">{comparisonLine(spending, previous, currency)}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-edge pt-3">
        <div>
          <dt className="text-sm text-muted">Income</dt>
          <dd className="text-[17px] font-semibold tabular-nums">
            {formatMoney(income, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Savings rate</dt>
          {rate.kind === 'none' && <dd className="text-[17px] font-semibold">404 Income Error</dd>}
          {rate.kind === 'ok' && (
            <dd className="text-[17px] font-semibold tabular-nums">{rate.text}</dd>
          )}
          {rate.kind === 'negative' && (
            <dd className="text-negative">
              <span className="flex items-center gap-2 text-[17px] font-semibold tabular-nums">
                <NuclearSign label="Warning" />
                {rate.text}
              </span>
              <span className="mt-0.5 block text-sm">Spent more than came in</span>
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}
