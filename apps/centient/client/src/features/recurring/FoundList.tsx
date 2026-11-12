// "Found in your entries": merchants paid about once a month that are not a bill yet. Add one (the form opens
// filled in) or hide it for good.
import { useQuery } from '@tanstack/react-query';
import { dayLabel, formatMoney } from '../../lib/format';
import { titleCase } from '../../lib/labels';
import { catalog } from '../../lib/state';
import { persist } from '../../models/query';
import { recurringApi, recurringQueries } from '../../models/recurring';
import type { Prefill } from '../../models/recurringForm';
import { Group, Row } from '../../ui/List';
import { WinButton } from '../../ui/WinButton';

export function FoundList({ today, onAdd }: { today: string; onAdd: (prefill: Prefill) => void }) {
  const { data } = useQuery(recurringQueries.found());
  if (!data?.length) return null;
  const currencyOf = (accountId: string) =>
    catalog.value.accounts.find(a => a.id === accountId)?.currency_code;
  return (
    <Group
      label="Found in your entries"
      foot="Paid about once a month. Add one as a bill, or hide it if it is not."
    >
      {data.map(f => {
        const name = titleCase(f.merchant);
        return (
          <Row
            key={`found:${f.merchant}:${f.accountId}`}
            title={name}
            sub={`${formatMoney(f.amount, currencyOf(f.accountId))} · ${f.payments} payments, last ${dayLabel(f.lastPaid, today)}`}
            trail={
              <span className="flex gap-1.5">
                <WinButton
                  label={`Add ${name} as a bill`}
                  onClick={() =>
                    onAdd({
                      name,
                      accountId: f.accountId,
                      categoryId: f.categoryId,
                      amount: f.amount,
                      nextDue: f.nextDue,
                    })
                  }
                >
                  Add
                </WinButton>
                <WinButton
                  label={`Hide ${name}`}
                  onClick={() =>
                    persist(() => recurringApi.hide(f.merchant), [recurringQueries.all()])
                  }
                >
                  Hide
                </WinButton>
              </span>
            }
          />
        );
      })}
    </Group>
  );
}
