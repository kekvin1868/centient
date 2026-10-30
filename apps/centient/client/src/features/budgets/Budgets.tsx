// Money's budgets: each with spent / limit, what's safe per day and its Budget forecast, grouped per currency
// (never added up across currencies), + Set a budget. The `?` beside the heading explains the status words.
import { Block, Button, Progressbar } from 'konsta/react';
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { categoryEmoji, pocketLabel } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { catalog, nameOf, version } from '../../lib/state';
import { Group, Row } from '../../ui/List';
import { WinButton } from '../../ui/WinButton';
import { BudgetGuideSheet } from './BudgetGuideSheet';
import { BudgetSheet, type BudgetRow } from './BudgetSheet';
import { forecastView, loadStartDay, STATUS_LABEL } from './forecast';

type Budgets = { cycle: { from: string; to: string; daysLeft: number }; budgets: BudgetRow[] };
// Last data shown, so coming back to Money shows it at once while it refreshes.
let cache: Budgets | null = null;

export function Budgets() {
  const [data, setData] = useState<Budgets | null>(cache);
  const [open, setOpen] = useState<BudgetRow | 'new' | null>(null);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    attempt(async () => { cache = await call(client.api.budgets.$get({ query: {} })); setData(cache); });
  }, [version.value]);
  if (!data) return null;
  const cat = catalog.value;
  const days = data.cycle.daysLeft;
  const startDay = loadStartDay();
  // Rupiah first, then the others by code; one heading each only when there is more than one.
  const currencies = [...new Set(data.budgets.map(b => b.currency))].sort((a, b) => (a === 'IDR' ? -1 : b === 'IDR' ? 1 : a.localeCompare(b)));
  const groups = currencies.length ? currencies : ['IDR'];
  const help = <WinButton label="What the budget words mean" onClick={() => setGuide(true)}>?</WinButton>;
  return (
    <>
      {groups.map((cur, i) => (
        <Group key={`budgets:${cur}`} aside={i === 0 ? help : undefined}
          label={`Budgets${groups.length > 1 ? ` in ${cur}` : ''}${i === 0 ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}`}>
          {!data.budgets.length && <Row title={<span className="text-muted">No budgets yet. A budget shows what you can still spend each day.</span>} />}
          {data.budgets.filter(b => b.currency === cur).map(b => {
            const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' in ');
            const over = b.remaining < 0;
            const f = forecastView(b, startDay, data.cycle.to);
            return (
              <Row key={b.id} onClick={() => setOpen(b)}
                title={<>{b.categoryId ? `${categoryEmoji(nameOf(cat.categories, b.categoryId))} ` : ''}{name}</>}
                trail={over ? <span className="k-color-brand-red text-sm font-semibold text-primary">{formatMoney(-b.remaining, cur)} over</span> : <span className="text-sm font-semibold text-muted">{formatMoney(b.remaining, cur)} left</span>}
                sub={<>{formatMoney(b.spent, cur)} of {formatMoney(b.limit, cur)}{b.safePerDay !== null && !over ? ` · ${formatMoney(b.safePerDay, cur)}/day` : ''}
                  {(f.status || f.hint) && (
                    <span className="mt-1 block">
                      {f.status && <span className={`font-semibold ${f.status === 'ON_TRACK' ? 'text-primary' : 'text-negative'}`}>{STATUS_LABEL[f.status]}</span>}
                      {f.line && ` · ${f.line}`}{f.hint}
                    </span>
                  )}
                  <Progressbar className={`mt-1.5 ${over ? 'k-color-brand-red' : ''}`} progress={Math.min(1, b.percent / 100)} /></>} />
            );
          })}
        </Group>
      ))}
      <Block><Button large rounded tonal onClick={() => setOpen('new')}>Set a budget</Button></Block>
      <BudgetSheet key={`budget:${open === 'new' ? 'new' : open?.id ?? 'none'}`} budget={open} onClose={() => setOpen(null)} />
      <BudgetGuideSheet open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
