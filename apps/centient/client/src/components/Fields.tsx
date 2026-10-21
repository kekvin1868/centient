// Form rows for grouped lists. Pickers are native selects (the phone's own wheel) laid over the row.
import { ListInput, ListItem, Stepper, Toggle } from 'konsta/react';

type Opt = { value: string; label: string };

export function PickerRow({ label, value, options, onChange, placeholder = 'Choose' }: {
  label: string; value: string | null; options: Opt[]; onChange: (v: string | null) => void; placeholder?: string;
}) {
  const shown = options.find(o => o.value === value)?.label ?? placeholder;
  return (
    <ListItem title={label} className="relative" strongTitle={false}
      after={<span class="flex items-center gap-1 max-w-[60vw] truncate">{shown}<span aria-hidden="true" class="text-xs">▾</span></span>}>
      <select class="absolute inset-0 opacity-0 cursor-pointer w-full" aria-label={label} value={value ?? ''}
        onChange={e => onChange((e.target as HTMLSelectElement).value || null)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option value={o.value}>{o.label}</option>)}
      </select>
    </ListItem>
  );
}

export function InputRow({ label, value, onInput, placeholder, type = 'text', inputMode }: {
  label: string; value: string; onInput: (v: string) => void; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text';
}) {
  return (
    <ListInput label={label} type={type} inputMode={inputMode} value={value} placeholder={placeholder}
      onInput={(e: Event) => onInput((e.target as HTMLInputElement).value)} />
  );
}

export function StepperRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <ListItem title={label} strongTitle={false}
      after={<Stepper value={value} small raised rounded onMinus={() => value > min && onChange(value - 1)} onPlus={() => value < max && onChange(value + 1)} />} />
  );
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <ListItem label title={label} strongTitle={false}
      after={<Toggle component="div" checked={checked} onChange={() => onChange(!checked)} />} />
  );
}
