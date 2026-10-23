// Money's budgets: each with spent / limit and what's safe per day, + Set a budget.
import { Block, Button, Progressbar } from 'konsta/react';
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { categoryEmoji, pocketLabel } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { catalog, nameOf, version } from '../../lib/state';
import { Group, Row } from '../../ui/List';
import { BudgetSheet, type BudgetRow } from './BudgetSheet';

type Budgets = { cycle: { from: string; to: string; daysLeft: number }; budgets: BudgetRow[] };
// Last data shown, so coming back to Money shows it at once while it refreshes.
let cache: Budgets | null = null;

export function Budgets() {
  const [data, setData] = useState<Budgets | null>(cache);
  const [open, setOpen] = useState<BudgetRow | 'new' | null>(null);
  useEffect(() => {
    attempt(async () => { cache = await call(client.api.budgets.$get({ query: {} })); setData(cache); });
  }, [version.value]);
  if (!data) return null;
  const cat = catalog.value;
  const days = data.cycle.daysLeft;
  return (
    <>
      <Group label={`Budgets · ${days} day${days === 1 ? '' : 's'} left`}>
        {!data.budgets.length && <Row title={<span className="text-muted">No budgets yet. A budget shows what you can still spend each day.</span>} />}
        {data.budgets.map(b => {
          const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' in ');
          const over = b.remaining < 0;
          return (
            <Row key={b.id} onClick={() => setOpen(b)}
              title={<>{b.categoryId ? `${categoryEmoji(nameOf(cat.categories, b.categoryId))} ` : ''}{name}</>}
              trail={over ? <span className="k-color-brand-red text-sm font-semibold text-primary">{formatMoney(-b.remaining)} over</span> : <span className="text-sm font-semibold text-muted">{formatMoney(b.remaining)} left</span>}
              sub={<>{formatMoney(b.spent)} of {formatMoney(b.limit)}{b.safePerDay !== null && !over ? ` · ${formatMoney(b.safePerDay)}/day` : ''}
                <Progressbar className={`mt-1.5 ${over ? 'k-color-brand-red' : ''}`} progress={Math.min(1, b.percent / 100)} /></>} />
          );
        })}
      </Group>
      <Block><Button large rounded tonal onClick={() => setOpen('new')}>Set a budget</Button></Block>
      <BudgetSheet key={`budget:${open === 'new' ? 'new' : open?.id ?? 'none'}`} budget={open} onClose={() => setOpen(null)} />
    </>
  );
}
