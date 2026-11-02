// Insights: the ledger read back for one period and one currency. Period bar, currency chips, the headline card
// (spending, comparison, income, savings rate), where it went, the trend, Daily Wallet Spending, top merchants,
// biggest expenses, Budgets over time. A category or merchant row opens its entries; an entry opens the entry sheet.
// `?` explains the budget words.
import { useEffect, useState } from 'react';
import { BudgetGuideSheet } from '../features/budgets/BudgetGuideSheet';
import { EntrySheet } from '../features/entries/EntrySheet';
import { BiggestExpenses } from '../features/insights/BiggestExpenses';
import { CurrencyChips } from '../features/insights/CurrencyChips';
import { EntriesSheet, type Pick } from '../features/insights/EntriesSheet';
import { InsightsHeadline } from '../features/insights/InsightsHeadline';
import { periodLabel, shareLabel, trendBars, weekdayBars, weekdayReadout } from '../features/insights/insights';
import { SavingsBars } from '../features/insights/SavingsBars';
import { PeriodBar, type Kind } from '../features/insights/PeriodBar';
import { Page } from '../layouts/Page';
import { call, client } from '../lib/api';
import { formatMoney } from '../lib/format';
import { categoryEmoji, pocketLabel, titleCase } from '../lib/labels';
import { attempt } from '../lib/run';
import { catalog, nameOf, version } from '../lib/state';
import { BarChart } from '../ui/BarChart';
import { RankedBars } from '../ui/RankedBars';
import { WinButton } from '../ui/WinButton';

const load = (q: { period: Kind; date?: string; currency?: string }) => call(client.api.insights.$get({ query: q }));
const loadSavings = (q: { period: Kind; date?: string; currency: string }) => call(client.api.budgets.savings.$get({ query: q }));
type Data = Awaited<ReturnType<typeof load>>;
type Savings = Awaited<ReturnType<typeof loadSavings>>;
type Entry = Data['biggest'][number]['entry'];

function Heading({ children }: { children: string }) {
  return <h2 className="mx-4 mb-3 mt-7 text-[22px] font-extrabold leading-none tracking-[-0.03em]">{children}</h2>;
}
// The last answer for today's view, so coming back to Insights shows it at once while it refreshes.
let cache: Data | null = null;

export function Insights() {
  const [kind, setKind] = useState<Kind>('cycle');
  const [date, setDate] = useState<string | undefined>();
  const [currency, setCurrency] = useState<string | undefined>();
  const [data, setData] = useState<Data | null>(cache);
  const [guide, setGuide] = useState(false);
  const [savings, setSavings] = useState<Savings>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  useEffect(() => {
    let live = true;
    attempt(async () => {
      const d = await load({ period: kind, date, currency });
      if (!live) return;
      // A currency picked earlier with no activity in this period: back to the default one.
      if (currency && d.currencies.length && !d.currencies.includes(currency)) { setCurrency(undefined); return; }
      if (kind === 'cycle' && !date && !currency) cache = d;
      setData(d);
      setSavings(await loadSavings({ period: kind, date, currency: d.currency }));
    });
    return () => { live = false; };
  }, [kind, date, currency, version.value]);

  if (!data) return <Page title="Insights" />;
  const cur = data.currency;
  const cats = catalog.value.categories;
  const span = periodLabel(data.period).replace(/ cycle$/, '');
  const days = weekdayBars(data.weekdays, cur);
  const history = savings.filter(b => b.cycles.length).map(b => ({
    id: b.id, cycles: b.cycles.map(c => ({ ...c, month: c.month! })),
    name: [b.categoryId && nameOf(cats, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' · '),
  }));
  return (
    <Page title="Insights">
      <PeriodBar kind={kind} span={data.period} oldest={data.oldest} onKind={setKind} onGo={setDate} />
      <CurrencyChips currencies={data.currencies} value={cur} onChange={setCurrency} />
      <InsightsHeadline currency={cur} spending={data.spending} income={data.income} savingsRate={data.savingsRate} previous={data.previous} />
      <Heading>Where it went</Heading>
      <RankedBars title="Spending by category" empty="No spending in this period yet."
        onPick={key => setPick({ title: `${nameOf(cats, key)} · ${span}`, categoryId: key })}
        items={data.categories.map(c => {
          const name = nameOf(cats, c.categoryId);
          return { key: c.categoryId, name, label: `${categoryEmoji(name)} ${name}`, value: c.amount, shown: formatMoney(c.amount, cur), note: shareLabel(c.amount, data.spending) ?? undefined };
        })} />
      <Heading>{kind === 'cycle' ? 'Spending each day' : 'Spending each month'}</Heading>
      <BarChart key={`trend:${data.period.from}:${cur}`} title={kind === 'cycle' ? 'Spending each day' : 'Spending each month'}
        empty="No spending in this period yet." bars={trendBars(data.trend, data.period.year, cur)} />
      <Heading>Daily Wallet Spending</Heading>
      <BarChart key={`week:${data.period.from}:${cur}`} title="Daily Wallet Spending" empty="No spending in this period yet."
        bars={days} readout={b => weekdayReadout(days.find(d => d.key === b.key)!, cur)} />
      <Heading>Top merchants</Heading>
      <RankedBars title="Top merchants" empty="No merchants named in this period yet."
        onPick={key => { const m = data.merchants.find(x => x.key === key)!; setPick({ title: `${titleCase(m.name)} · ${span}`, merchant: m.key }); }}
        items={data.merchants.map(m => ({
          key: m.key, name: titleCase(m.name), label: titleCase(m.name), value: m.total, shown: formatMoney(m.total, cur),
          note: `${m.visits} ${m.visits === 1 ? 'visit' : 'visits'}`,
        }))} />
      <Heading>Biggest expenses</Heading>
      <BiggestExpenses rows={data.biggest} currency={cur} onOpen={setEntry} />
      {savings.length > 0 && (<>
        <Heading>Budgets over time</Heading>
        {history.length
          ? <SavingsBars budgets={history} currency={cur} />
          : <p className="mx-4 border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">Shows here once a budget has run a full cycle.</p>}
      </>)}
      <div className="mx-4 mt-6 flex justify-end">
        <WinButton label="What the budget words mean" onClick={() => setGuide(true)}>?</WinButton>
      </div>
      <BudgetGuideSheet open={guide} onClose={() => setGuide(false)} />
      <EntriesSheet pick={pick} from={data.period.from} last={data.period.last} currency={cur} onClose={() => setPick(null)}
        onOpen={setEntry} />
      <EntrySheet key={`entry:${entry?.id ?? 'none'}`} entry={entry} onClose={() => setEntry(null)} />
    </Page>
  );
}
