// Insights: the ledger read back for one period and one currency. Period bar, currency chips, the headline card
// (spending, comparison, income, savings rate), where it went, the trend, Daily average spendings, top merchants,
// biggest expenses, Budgets over time. A category or merchant row opens its entries; an entry opens the entry sheet.
// The export row makes a report PDF of the sections marked `data-report`, or a CSV (step 7); the `?` by the title
// explains the budget words.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BudgetGuideSheet } from '../features/budgets/BudgetGuideSheet';
import { EntrySheet } from '../features/entries/EntrySheet';
import { BiggestExpenses } from '../features/insights/BiggestExpenses';
import { CurrencyChips } from '../features/insights/CurrencyChips';
import { EntriesSheet, type Pick } from '../features/insights/EntriesSheet';
import { ExportRow } from '../features/insights/ExportRow';
import { ChartsGuideSheet } from '../features/insights/ChartsGuideSheet';
import { InsightsHeadline } from '../features/insights/InsightsHeadline';
import { ListsGuideSheet } from '../features/insights/ListsGuideSheet';
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

/** A section title; `help` puts a `?` at its far right (the ◆ and rule stay on the row, the button is left out of the PDF). */
function Heading({ children, help }: { children: string; help?: ReactNode }) {
  const look = 'section-title mx-4 mb-3 mt-7 text-[22px] leading-none tracking-[-0.03em]';
  if (!help) return <h2 className={look}>{children}</h2>;
  return <div className={`${look} flex items-center gap-[.5em]`}><h2>{children}</h2><span className="ml-auto [text-shadow:none]" data-noprint>{help}</span></div>;
}
// The last answer for today's view, so coming back to Insights shows it at once while it refreshes.
let cache: Data | null = null;

export function Insights() {
  const [kind, setKind] = useState<Kind>('cycle');
  const [date, setDate] = useState<string | undefined>();
  const [currency, setCurrency] = useState<string | undefined>();
  const [data, setData] = useState<Data | null>(cache);
  const [guide, setGuide] = useState(false);
  const [lists, setLists] = useState(false);
  const [charts, setCharts] = useState(false);
  const [savings, setSavings] = useState<Savings>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const screen = useRef<HTMLDivElement>(null);
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

  const help = <WinButton label="What the budget words mean" onClick={() => setGuide(true)}>?</WinButton>;
  const chartsHelp = <WinButton label="How daily and daily average spendings differ" onClick={() => setCharts(true)}>?</WinButton>;
  const listsHelp = <WinButton label="How top merchants and biggest expenses differ" onClick={() => setLists(true)}>?</WinButton>;
  if (!data) return <Page title="Insights" action={help}><BudgetGuideSheet open={guide} onClose={() => setGuide(false)} /></Page>;
  const cur = data.currency;
  const cats = catalog.value.categories;
  const span = periodLabel(data.period).replace(/ cycle$/, '');
  const days = weekdayBars(data.weekdays, cur);
  const history = savings.filter(b => b.cycles.length).map(b => ({
    id: b.id, cycles: b.cycles.map(c => ({ ...c, month: c.month! })),
    name: [b.categoryId && nameOf(cats, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' · '),
  }));
  return (
    <Page title="Insights" action={help}>
      <PeriodBar kind={kind} span={data.period} oldest={data.oldest} onKind={setKind} onGo={setDate} />
      <CurrencyChips currencies={data.currencies} value={cur} onChange={setCurrency} />
      <div ref={screen}>
      <section data-report>
        <InsightsHeadline currency={cur} spending={data.spending} income={data.income} savingsRate={data.savingsRate} previous={data.previous} />
      </section>
      <section data-report>
      <Heading>Where it went</Heading>
      <RankedBars title="Spending by category" empty="No spending in this period yet."
        onPick={key => setPick({ title: `${nameOf(cats, key)} · ${span}`, categoryId: key })}
        items={data.categories.map(c => {
          const name = nameOf(cats, c.categoryId);
          return { key: c.categoryId, name, label: `${categoryEmoji(name)} ${name}`, value: c.amount, shown: formatMoney(c.amount, cur), note: shareLabel(c.amount, data.spending) ?? undefined };
        })} />
      </section>
      <section data-report>
      <Heading help={chartsHelp}>{kind === 'cycle' ? 'Daily spendings' : 'Monthly spendings'}</Heading>
      <BarChart key={`trend:${data.period.from}:${cur}`} title={kind === 'cycle' ? 'Daily spendings' : 'Monthly spendings'}
        empty="No spending in this period yet." bars={trendBars(data.trend, data.period.year, cur)} />
      </section>
      <section data-report>
      <Heading help={chartsHelp}>Daily average spendings</Heading>
      <BarChart key={`week:${data.period.from}:${cur}`} title="Daily average spendings" empty="No spending in this period yet."
        bars={days} readout={b => weekdayReadout(days.find(d => d.key === b.key)!, cur)} />
      </section>
      <section data-report>
      <Heading help={listsHelp}>Top merchants</Heading>
      <RankedBars title="Top merchants" empty="No merchants named in this period yet."
        onPick={key => { const m = data.merchants.find(x => x.key === key)!; setPick({ title: `${titleCase(m.name)} · ${span}`, merchant: m.key }); }}
        items={data.merchants.map(m => ({
          key: m.key, name: titleCase(m.name), label: titleCase(m.name), value: m.total, shown: formatMoney(m.total, cur),
          note: `${m.visits} ${m.visits === 1 ? 'visit' : 'visits'}`,
        }))} />
      </section>
      <section data-report>
      <Heading help={listsHelp}>Biggest expenses</Heading>
      <BiggestExpenses rows={data.biggest} currency={cur} onOpen={setEntry} />
      </section>
      {savings.length > 0 && (<section data-report>
        <Heading>Budgets over time</Heading>
        {history.length
          ? <SavingsBars budgets={history} currency={cur} />
          : <p className="mx-4 border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">Shows here once a budget has run a full cycle.</p>}
      </section>)}
      </div>
      <ExportRow key={`export:${data.period.from}:${data.period.to}:${cur}`} period={data.period} currency={cur} report={() => screen.current}
        empty={data.spending === 0 && data.income === 0} />
      <BudgetGuideSheet open={guide} onClose={() => setGuide(false)} />
      <ListsGuideSheet open={lists} onClose={() => setLists(false)} />
      <ChartsGuideSheet open={charts} onClose={() => setCharts(false)} />
      <EntriesSheet pick={pick} from={data.period.from} last={data.period.last} currency={cur} onClose={() => setPick(null)}
        onOpen={setEntry} />
      <EntrySheet key={`entry:${entry?.id ?? 'none'}`} entry={entry} onClose={() => setEntry(null)} />
    </Page>
  );
}
