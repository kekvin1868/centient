// Insights: the ledger read back for one period and one currency. Period bar, currency chips, the headline card
// (spending, comparison, income, savings rate), then where it went. `?` explains the budget words.
import { useEffect, useState } from 'react';
import { BudgetGuideSheet } from '../features/budgets/BudgetGuideSheet';
import { CurrencyChips } from '../features/insights/CurrencyChips';
import { InsightsHeadline } from '../features/insights/InsightsHeadline';
import { shareLabel } from '../features/insights/insights';
import { PeriodBar, type Kind } from '../features/insights/PeriodBar';
import { Page } from '../layouts/Page';
import { call, client } from '../lib/api';
import { formatMoney } from '../lib/format';
import { categoryEmoji } from '../lib/labels';
import { attempt } from '../lib/run';
import { catalog, nameOf, version } from '../lib/state';
import { RankedBars } from '../ui/RankedBars';
import { WinButton } from '../ui/WinButton';

const load = (q: { period: Kind; date?: string; currency?: string }) => call(client.api.insights.$get({ query: q }));
type Data = Awaited<ReturnType<typeof load>>;
// The last answer for today's view, so coming back to Insights shows it at once while it refreshes.
let cache: Data | null = null;

export function Insights() {
  const [kind, setKind] = useState<Kind>('cycle');
  const [date, setDate] = useState<string | undefined>();
  const [currency, setCurrency] = useState<string | undefined>();
  const [data, setData] = useState<Data | null>(cache);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    let live = true;
    attempt(async () => {
      const d = await load({ period: kind, date, currency });
      if (!live) return;
      // A currency picked earlier with no activity in this period: back to the default one.
      if (currency && d.currencies.length && !d.currencies.includes(currency)) { setCurrency(undefined); return; }
      if (kind === 'cycle' && !date && !currency) cache = d;
      setData(d);
    });
    return () => { live = false; };
  }, [kind, date, currency, version.value]);

  if (!data) return <Page title="Insights" />;
  const cur = data.currency;
  const cats = catalog.value.categories;
  return (
    <Page title="Insights">
      <PeriodBar kind={kind} span={data.period} oldest={data.oldest} onKind={setKind} onGo={setDate} />
      <CurrencyChips currencies={data.currencies} value={cur} onChange={setCurrency} />
      <InsightsHeadline currency={cur} spending={data.spending} income={data.income} savingsRate={data.savingsRate} previous={data.previous} />
      <h2 className="mx-4 mb-3 mt-7 text-[22px] font-extrabold leading-none tracking-[-0.03em]">Where it went</h2>
      <RankedBars title="Spending by category" empty="No spending in this period yet."
        items={data.categories.map(c => {
          const name = nameOf(cats, c.categoryId);
          return { key: `cat:${c.categoryId}`, name, label: `${categoryEmoji(name)} ${name}`, value: c.amount, shown: formatMoney(c.amount, cur), note: shareLabel(c.amount, data.spending) ?? undefined };
        })} />
      <div className="mx-4 mt-6 flex justify-end">
        <WinButton label="What the budget words mean" onClick={() => setGuide(true)}>?</WinButton>
      </div>
      <BudgetGuideSheet open={guide} onClose={() => setGuide(false)} />
    </Page>
  );
}
