// What the budget words mean: the three statuses and how the Budget forecast is worked out. Opened by the `?`
// beside the Budgets heading on Money (and on Insights).
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { STATUS_LABEL } from './forecast';

const WORDS = [
  [STATUS_LABEL.ON_TRACK, 'At this rate, spending ends the month below the limit.'],
  [STATUS_LABEL.LIKELY_OVER, 'Not over yet, but at this rate spending ends the month above the limit.'],
  [STATUS_LABEL.OVER, 'Already spent more than the limit.'],
] as const;

export function BudgetGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Budget words">
      <Group foot="The forecast takes what you spent so far, divides it by the days gone, and multiplies by the days in the month. It stays hidden for the first days of each month; change when it starts in Settings.">
        {WORDS.map(([word, meaning]) => <Row key={`guide:${word}`} title={word} sub={meaning} />)}
      </Group>
    </Sheet>
  );
}
