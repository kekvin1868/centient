// Segmented control with a sliding thumb.
type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string };

export function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  const i = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      <span class="seg-thumb" style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map(o => (
        <button type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
