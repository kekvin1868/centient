// "Forecast starts on day": how many days into each month the Budget forecast stays hidden. Kept on this
// device only. Sits directly below "Month starts on day" in Settings.
import { useState } from 'react';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { loadStartDay, saveStartDay } from './forecast';

const DAYS = Array.from({ length: 7 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export function ForecastStart() {
  const [day, setDay] = useState(loadStartDay);
  return (
    <Group foot="Early in the month, a few purchases can make the forecast jump. It stays hidden until this day, every month.">
      <PickerRow label="Forecast starts on day" value={String(day)} options={DAYS}
        onChange={v => { const n = Number(v ?? 3); saveStartDay(n); setDay(loadStartDay()); }} />
    </Group>
  );
}
