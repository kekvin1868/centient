// The day the budget month starts (payday), so each month runs payday to payday.
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { me, refresh } from '../../lib/state';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { showToast } from '../../ui/Toast';

export function MonthStart() {
  const day = me.value?.workspace.cycle_start_day ?? 1;
  return (
    <Group label="Budgets" foot="Pick the day your salary usually arrives, so each month runs payday to payday.">
      <PickerRow label="Month starts on day" value={String(day)} placeholder="1"
        options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        onChange={v => attempt(async () => {
          await call(client.api.workspace.$patch({ json: { cycle_start_day: Number(v ?? 1) } }));
          await refresh();
          showToast('Saved');
        })} />
    </Group>
  );
}
