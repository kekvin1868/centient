// Segmented control (Konsta, iOS "strong" style).
import { Segmented as KSegmented, SegmentedButton } from 'konsta/react';

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string };

export function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div className="mx-4 my-4" role="radiogroup" aria-label={label}>
      <KSegmented strong rounded>
        {options.map(o => (
          <SegmentedButton key={o.value} active={o.value === value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </SegmentedButton>
        ))}
      </KSegmented>
    </div>
  );
}
