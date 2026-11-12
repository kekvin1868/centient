// Form rows for grouped lists. Pickers are native selects (the phone's own wheel) laid over the row; dates use our
// own DatePicker, opened inline under the row.
import { ListItem, Stepper, Toggle } from 'konsta/react';
import { useRef, useState } from 'react';
import { DatePicker } from './DatePicker';

/** An option; ones with a `group` are listed under that heading, after the plain ones. */
type Opt = { value: string; label: string; group?: string };

export function PickerRow({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
}: {
  label: string;
  value: string | null;
  options: Opt[];
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const shown = options.find(o => o.value === value)?.label ?? placeholder;
  return (
    <ListItem
      title={label}
      className="relative"
      strongTitle={false}
      after={
        <span className="flex items-center gap-1 max-w-[60vw] truncate">
          {shown}
          <span aria-hidden="true" className="text-xs">
            ▾
          </span>
        </span>
      }
    >
      <select
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        aria-label={label}
        value={value ?? ''}
        onChange={e => onChange((e.target as HTMLSelectElement).value || null)}
      >
        <option value="">{placeholder}</option>
        {options
          .filter(o => !o.group)
          .map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        {[...new Set(options.flatMap(o => (o.group ? [o.group] : [])))].map(g => (
          <optgroup key={`group:${g}`} label={g}>
            {options
              .filter(o => o.group === g)
              .map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </ListItem>
  );
}

export function InputRow({
  label,
  value,
  onInput,
  placeholder,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: 'numeric' | 'text';
}) {
  // Label on the left, value on the right, like PickerRow (Konsta's ListInput stacks the label above).
  return (
    <ListItem
      label
      title={label}
      strongTitle={false}
      after={
        <input
          className="w-[60vw] max-w-56 bg-transparent text-right outline-none placeholder:opacity-40"
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={e => onInput(e.target.value)}
        />
      }
    />
  );
}

/** "6 Nov 2026", or "" for no date. */
export const dateText = (d: string) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

/** A date row: tap it to open the calendar under it. `optional` dates can be cleared. */
export function DateRow({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const pick = (d: string) => {
    onChange(d);
    close();
  };
  return (
    <>
      <ListItem
        title={label}
        className="relative"
        strongTitle={false}
        after={
          <span className="flex items-center gap-1">
            {dateText(value) || <span className="opacity-40">Not set</span>}
            <span aria-hidden="true" className="text-xs">
              ▾
            </span>
          </span>
        }
      >
        <button
          ref={trigger}
          type="button"
          className="absolute inset-0 w-full cursor-pointer"
          aria-label={`${label}, ${dateText(value) || 'not set'}`}
          aria-expanded={open}
          data-value={value}
          onClick={() => setOpen(o => !o)}
        />
      </ListItem>
      {open && (
        <li className="px-4">
          <DatePicker
            label={label}
            value={value}
            onPick={pick}
            onClose={close}
            onClear={optional ? () => pick('') : undefined}
          />
        </li>
      )}
    </>
  );
}

export function StepperRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <ListItem
      title={label}
      strongTitle={false}
      after={
        <Stepper
          value={value}
          small
          raised
          rounded
          onMinus={() => value > min && onChange(value - 1)}
          onPlus={() => value < max && onChange(value + 1)}
        />
      }
    />
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <ListItem
      label
      title={label}
      strongTitle={false}
      after={<Toggle component="div" checked={checked} onChange={() => onChange(!checked)} />}
    />
  );
}
