// Temporary budgets that ran to their end, newest first: dates, limit, spent and what was saved (or went over).
// Opened by History beside the Budgets heading on Money.
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { pocketLabel } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { catalog, nameOf } from '../../lib/state';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { period } from './forecast';

type Ended = { id: string; categoryId: string | null; envelopeId: string | null; currency: string; startsOn: string; endsOn: string; limit: number; spent: number; saved: number };

export function BudgetHistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Ended[] | null>(null);
  useEffect(() => {
    if (open) attempt(async () => setRows(await call(client.api.budgets.history.$get())));
  }, [open]);
  const cat = catalog.value;
  return (
    <Sheet open={open} onClose={onClose} title="Temporary budgets">
      <Group>
        {rows?.length === 0 && <Row title={<span className="text-muted">Nothing here yet. Temporary budgets move here when they end.</span>} />}
        {rows?.map(b => {
          const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' in ');
          return (
            <Row key={b.id} title={<>{name} · <span className="whitespace-nowrap">{period(b.startsOn, b.endsOn)}</span></>}
              sub={`${formatMoney(b.spent, b.currency)} of ${formatMoney(b.limit, b.currency)}`}
              trail={b.saved < 0
                ? <span className="text-sm font-semibold text-negative">{formatMoney(-b.saved, b.currency)} over</span>
                : <span className="text-sm font-semibold text-primary">{formatMoney(b.saved, b.currency)} saved</span>} />
          );
        })}
      </Group>
    </Sheet>
  );
}
