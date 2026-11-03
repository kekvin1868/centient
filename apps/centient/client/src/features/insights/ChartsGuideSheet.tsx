// How Daily spendings and Daily average spendings differ: what each chart shows, the question it answers, and one
// example (two weeks of November) read both ways. Opened by the `?` beside either chart's title on Insights.
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

const SPENT = [
  ['Mon 2 Nov', 'Lunch', 'Rp50.000'], ['Wed 4 Nov', 'Groceries', 'Rp300.000'], ['Sat 7 Nov', 'Dinner out', 'Rp200.000'],
  ['Mon 9 Nov', 'Lunch', 'Rp50.000'], ['Sat 14 Nov', 'Dinner and cinema', 'Rp300.000'],
];

export function ChartsGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Daily vs daily average">
      <Group>
        <Row title="Daily spendings" sub="One bar per date: what you spent on that day (in the year view, per month). It answers: when did I spend?" />
        <Row title="Daily average spendings" sub="Seven bars, Monday to Sunday: what a typical Monday, Tuesday and so on costs you, each weekday's spending divided by how many times it came round. It answers: which day of the week costs me most?" />
      </Group>
      <Group label="Example: two weeks of November">
        {SPENT.map(([day, what, amount]) => <Row key={`spent:${day}`} title={what} sub={day} trail={<span className="num">{amount}</span>} />)}
      </Group>
      <p className="mx-4 mb-6 text-[15px] text-muted" data-testid="charts-guide-summary">
        Daily spendings shows a bar on each of those five dates, so the 4th and the 14th stand out as your big days. Daily
        average spendings folds them into one week: Saturday Rp250.000 (Rp500.000 over 2 Saturdays), Wednesday Rp150.000,
        Monday Rp50.000. So your big days were the 4th and the 14th, and your expensive weekday is Saturday.
      </p>
    </Sheet>
  );
}
