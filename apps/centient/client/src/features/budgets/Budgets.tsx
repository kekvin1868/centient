// Money's budgets: each with spent / limit, what's safe per day and its Budget forecast, grouped per currency
// (never added up across currencies), + Set a budget. Temporary budgets sit under the cycle ones with their dates.
// Beside the heading: History (temporary budgets that ended) and `?` (what the status words mean).
import { useQuery } from '@tanstack/react-query';
import { Block, Button, Progressbar } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { categoryEmoji } from '../../lib/labels';
import { catalog, nameOf } from '../../lib/state';
import {
  budgetCurrencies,
  budgetName,
  budgetQueries,
  budgetsIn,
  type Budget,
  type BudgetCycle,
} from '../../models/budget';
import {
  forecastView,
  loadStartDay,
  monthDay,
  startDayFor,
  STATUS_LABEL,
} from '../../models/forecast';
import { Group, Row } from '../../ui/List';
import { WinButton } from '../../ui/WinButton';
import { BudgetGuideSheet } from './BudgetGuideSheet';
import { BudgetHistorySheet } from './BudgetHistorySheet';
import { BudgetSheet } from './BudgetSheet';

export function Budgets() {
  const { data } = useQuery(budgetQueries.status());
  const [open, setOpen] = useState<Budget | 'new' | null>(null);
  const [guide, setGuide] = useState(false);
  const [history, setHistory] = useState(false);
  if (!data) return null;

  const days = data.cycle.daysLeft;
  const groups = budgetCurrencies(data.budgets);
  const help = (
    <span className="flex gap-1.5">
      <WinButton label="Temporary budgets that ended" onClick={() => setHistory(true)}>
        History
      </WinButton>
      <WinButton label="What the budget words mean" onClick={() => setGuide(true)}>
        ?
      </WinButton>
    </span>
  );
  const label = (cur: string, first: boolean) =>
    [
      `Budgets${groups.length > 1 ? ` in ${cur}` : ''}`,
      first ? `${days} day${days === 1 ? '' : 's'} left` : '',
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      {groups.map((cur, i) => (
        <Group
          key={`budgets:${cur}`}
          aside={i === 0 ? help : undefined}
          label={label(cur, i === 0)}
        >
          {!data.budgets.length && (
            <Row
              title={
                <span className="text-muted">
                  No budgets yet. A budget shows what you can still spend each day.
                </span>
              }
            />
          )}
          {budgetsIn(data.budgets, cur).map(b => (
            <BudgetRow key={b.id} budget={b} cycle={data.cycle} onOpen={() => setOpen(b)} />
          ))}
        </Group>
      ))}
      <Block>
        <Button large rounded tonal onClick={() => setOpen('new')}>
          Set a budget
        </Button>
      </Block>
      <BudgetSheet
        key={`budget:${open === 'new' ? 'new' : (open?.id ?? 'none')}`}
        budget={open}
        onClose={() => setOpen(null)}
      />
      <BudgetGuideSheet open={guide} onClose={() => setGuide(false)} />
      <BudgetHistorySheet open={history} onClose={() => setHistory(false)} />
    </>
  );
}

function BudgetRow({
  budget: b,
  cycle,
  onOpen,
}: {
  budget: Budget;
  cycle: BudgetCycle;
  onOpen: () => void;
}) {
  const cat = catalog.value;
  const cur = b.currency;
  const over = b.remaining < 0;
  const startDay = loadStartDay();
  const f = b.startsOn
    ? forecastView(b, startDayFor(startDay, b.cycleDays), b.endsOn!)
    : forecastView(b, startDay, cycle.to);
  // An upcoming temporary budget has no days gone yet.
  const dates =
    b.startsOn &&
    (b.daysGone === null ? `Starts ${monthDay(b.startsOn)}` : `Ends ${monthDay(b.endsOn!)}`);
  const emoji = b.categoryId ? `${categoryEmoji(nameOf(cat.categories, b.categoryId))} ` : '';
  const perDay = b.safePerDay !== null && !over ? ` · ${formatMoney(b.safePerDay, cur)}/day` : '';

  return (
    <Row
      onClick={onOpen}
      title={
        <>
          {emoji}
          {budgetName(b, cat)}
          {dates && (
            <span className="ml-2 align-middle text-xs font-normal text-muted">
              <span className="mr-0.5 border border-current px-1">Temporary</span> {dates}
            </span>
          )}
        </>
      }
      trail={
        over ? (
          <span className="k-color-brand-red text-sm font-semibold text-primary">
            {formatMoney(-b.remaining, cur)} over
          </span>
        ) : (
          <span className="text-sm font-semibold text-muted">
            {formatMoney(b.remaining, cur)} left
          </span>
        )
      }
      sub={
        <>
          {formatMoney(b.spent, cur)} of {formatMoney(b.limit, cur)}
          {perDay}
          {(f.status || f.hint) && (
            <span className="mt-1 block">
              {f.status && (
                <span
                  className={`font-semibold ${f.status === 'ON_TRACK' ? 'text-primary' : 'text-negative'}`}
                >
                  {STATUS_LABEL[f.status]}
                </span>
              )}
              {f.line && ` · ${f.line}`}
              {f.hint}
            </span>
          )}
          <Progressbar
            className={`mt-1.5 ${over ? 'k-color-brand-red' : ''}`}
            progress={Math.min(1, b.percent / 100)}
          />
        </>
      }
    />
  );
}
