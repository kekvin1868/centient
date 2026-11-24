// Home's "After card bills", worked out: your money, less each card's bill left to pay and what was spent on it
// since it closed (that is on its next bill). Loaded when tapped (Home's first paint has a size budget).
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import type { cardsOwed } from '../../models/recurring';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

export function AfterBillsSheet({
  open,
  money,
  owed,
  after,
  currency,
  onClose,
}: {
  open: boolean;
  money: number;
  owed: ReturnType<typeof cardsOwed>;
  after: number;
  currency: string;
  onClose: () => void;
}) {
  const m = (n: number) => formatMoney(n, currency);
  const name = (id: string) => nameOf(catalog.value.accounts, id);
  return (
    <Sheet open={open} onClose={onClose} title="After card bills">
      <Group foot="Installments on later bills are not taken off until their bill closes.">
        <Row title="Your money" trail={m(money)} />
        {owed.flatMap(c => [
          ...(c.left
            ? [
                <Row
                  key={`${c.accountId}:left`}
                  title={`− ${name(c.accountId)} bill left`}
                  trail={m(c.left)}
                />,
              ]
            : []),
          ...(c.spentSince
            ? [
                <Row
                  key={`${c.accountId}:since`}
                  title={`− ${name(c.accountId)} spent since closing`}
                  trail={m(c.spentSince)}
                />,
              ]
            : []),
        ])}
        <Row title="= After card bills" trail={m(after)} />
      </Group>
    </Sheet>
  );
}
