// Temporary budgets that ran to their end, newest first: dates, limit, spent and what was saved (or went over).
// Opened by History beside the Budgets heading on Money.
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '../../lib/format';
import { catalog } from '../../lib/state';
import { budgetName, budgetQueries } from '../../models/budget';
import { period } from '../../models/forecast';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

export function BudgetHistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: rows } = useQuery({ ...budgetQueries.history(), enabled: open });
  const cat = catalog.value;
  return (
    <Sheet open={open} onClose={onClose} title="Temporary budgets">
      <Group>
        {rows?.length === 0 && (
          <Row
            title={
              <span className="text-muted">
                Nothing here yet. Temporary budgets move here when they end.
              </span>
            }
          />
        )}
        {rows?.map(b => {
          const name = budgetName(b, cat);
          return (
            <Row
              key={b.id}
              title={
                <>
                  {name} · <span className="whitespace-nowrap">{period(b.startsOn, b.endsOn)}</span>
                </>
              }
              sub={`${formatMoney(b.spent, b.currency)} of ${formatMoney(b.limit, b.currency)}`}
              trail={
                b.saved < 0 ? (
                  <span className="text-sm font-semibold text-negative">
                    {formatMoney(-b.saved, b.currency)} over
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-primary">
                    {formatMoney(b.saved, b.currency)} saved
                  </span>
                )
              }
            />
          );
        })}
      </Group>
    </Sheet>
  );
}
