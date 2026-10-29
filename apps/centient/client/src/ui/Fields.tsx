// Form rows for grouped lists. Pickers are native selects (the phone's own wheel) laid over the row.
import { ListItem, Stepper, Toggle } from 'konsta/react';

/** An option; ones with a `group` are listed under that heading, after the plain ones. */
type Opt = { value: string; label: string; group?: string };

export function PickerRow({ label, value, options, onChange, placeholder = 'Choose' }: {
  label: string; value: string | null; options: Opt[]; onChange: (v: string | null) => void; placeholder?: string;
}) {
  const shown = options.find(o => o.value === value)?.label ?? placeholder;
  return (
    <ListItem title={label} className="relative" strongTitle={false}
      after={<span className="flex items-center gap-1 max-w-[60vw] truncate">{shown}<span aria-hidden="true" className="text-xs">▾</span></span>}>
      <select className="absolute inset-0 opacity-0 cursor-pointer w-full" aria-label={label} value={value ?? ''}
        onChange={e => onChange((e.target as HTMLSelectElement).value || null)}>
        <option value="">{placeholder}</option>
        {options.filter(o => !o.group).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {[...new Set(options.flatMap(o => (o.group ? [o.group] : [])))].map(g => (
          <optgroup key={`group:${g}`} label={g}>
            {options.filter(o => o.group === g).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </ListItem>
  );
}

export function InputRow({ label, value, onInput, placeholder, type = 'text', inputMode }: {
  label: string; value: string; onInput: (v: string) => void; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text';
}) {
  // Label on the left, value on the right, like PickerRow (Konsta's ListInput stacks the label above).
  return (
    <ListItem label title={label} strongTitle={false}
      after={<input className="w-[60vw] max-w-56 bg-transparent text-right outline-none placeholder:opacity-40" type={type} inputMode={inputMode}
        value={value} placeholder={placeholder} aria-label={label} onChange={e => onInput(e.target.value)} />} />
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
