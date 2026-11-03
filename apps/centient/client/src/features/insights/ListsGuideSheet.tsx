// How Top merchants and Biggest expenses differ, with one worked example. Opened by the `?` beside either title on
// Insights; same look as the budget words guide.
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

const SPENT = [
  ['Indomaret', 'Nov 3', 'Rp150.000'],
  ['Indomaret', 'Nov 10', 'Rp100.000'],
  ['Shopping (no merchant)', 'Nov 12', 'Rp800.000'],
];
const MERCHANTS = ['1. Indomaret · Rp250.000 · 2 visits'];
const BIGGEST = ['1. Shopping · Rp800.000', '2. Indomaret · Rp150.000', '3. Indomaret · Rp100.000'];

export function ListsGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Merchants vs expenses">
      <Group>
        <Row
          title="Top merchants"
          sub="Spending added up per shop, with how many visits. Entries without a merchant name are left out."
        />
        <Row
          title="Biggest expenses"
          sub="Your largest single purchases, one row each, with or without a merchant. A split bill counts your share."
        />
      </Group>
      <Group label="Example: this month you spent">
        {SPENT.map(([what, day, amount]) => (
          <Row
            key={`spent:${day}`}
            title={what}
            sub={day}
            trail={<span className="num">{amount}</span>}
          />
        ))}
      </Group>
      <div
        className="mx-4 mb-4 grid grid-cols-2 border border-edge text-[14px]"
        data-testid="lists-guide-table"
      >
        <p className="border-b border-r border-edge px-3 py-2 font-bold">Top merchants</p>
        <p className="border-b border-edge px-3 py-2 font-bold">Biggest expenses</p>
        <div className="num border-r border-edge px-3 py-2">
          {MERCHANTS.map(l => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="num px-3 py-2">
          {BIGGEST.map(l => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
      <p className="mx-4 mb-6 text-[15px] text-muted">
        Top merchants: where do I keep spending? Biggest expenses: what were my biggest one-off
        buys? The Rp800.000 buy has no merchant, so it never shows under Top merchants.
      </p>
    </Sheet>
  );
}
