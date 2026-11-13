// Money's way into Subscriptions: one row saying how many bills repeat and what they cost a month.
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '../../lib/format';
import { recurringQueries } from '../../models/recurring';
import { Group, Row } from '../../ui/List';

export function SubscriptionsLink({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery(recurringQueries.list());
  if (!data) return null;
  const count = data.items.length;
  const cost = data.totals.map(t => `${formatMoney(t.perMonth, t.currency)} a month`).join(' · ');
  return (
    <Group label="Subscriptions">
      <Row
        title={count ? `${count} bill${count === 1 ? '' : 's'} that repeat` : 'Bills that repeat'}
        sub={
          count ? cost || 'Amounts vary' : 'Netflix, rent, electricity: see what is due and when.'
        }
        onClick={onOpen}
        chevron
      />
    </Group>
  );
}
