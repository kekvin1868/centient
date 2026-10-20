// Form rows for grouped lists. Pickers are native selects (the phone's own wheel), styled as list rows.
type Opt = { value: string; label: string };

export function PickerRow({ label, value, options, onChange, placeholder = 'Choose' }: {
  label: string; value: string | null; options: Opt[]; onChange: (v: string | null) => void; placeholder?: string;
}) {
  return (
    <label class="row field-row">
      <span class="row-main">{label}</span>
      <select class="row-select" value={value ?? ''} onChange={e => onChange((e.target as HTMLSelectElement).value || null)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function InputRow({ label, value, onInput, placeholder, type = 'text', inputMode }: {
  label: string; value: string; onInput: (v: string) => void; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text';
}) {
  return (
    <label class="row field-row">
      <span class="row-label">{label}</span>
      <input class="input row-input" type={type} inputMode={inputMode} value={value} placeholder={placeholder}
        onInput={e => onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
}

export function StepperRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div class="row field-row">
      <span class="row-main">{label}</span>
      <span class="stepper">
        <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <span class="num" aria-live="polite">{value}</span>
        <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </span>
    </div>
  );
}
