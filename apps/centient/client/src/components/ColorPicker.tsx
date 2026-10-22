// Pick a pocket color: the swatch set, plus "Custom" (the device's own color picker).
import { Check, Palette } from '@phosphor-icons/react';
import { POCKET_COLORS, inkOn } from '../lib/pocketColors';

export function ColorPicker({ value, onChange, label = 'Color' }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const custom = !POCKET_COLORS.some(c => c.hex === value);
  return (
    <div className="mx-4 my-4" role="radiogroup" aria-label={label}>
      <div className="mb-2 text-[15px] font-semibold text-muted">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {POCKET_COLORS.map(c => (
          <button key={c.hex} type="button" role="radio" aria-checked={value === c.hex} aria-label={c.name} onClick={() => onChange(c.hex)}
            className={`grid size-10 place-items-center rounded-full border border-edge active:opacity-70 ${value === c.hex ? 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--raised)]' : ''}`}
            style={{ background: c.hex, color: inkOn(c.hex) }}>
            {value === c.hex && <Check size={16} weight="bold" aria-hidden="true" />}
          </button>
        ))}
        <label className={`relative grid size-10 cursor-pointer place-items-center rounded-full border border-edge active:opacity-70 ${custom ? 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--raised)]' : ''}`}
          style={{ background: custom ? value : 'conic-gradient(#1ff0dc, #8fd3ff, #c3b1ff, #ff8cc6, #9ff2c6, #1ff0dc)', color: custom ? inkOn(value) : '#0b0f10' }}>
          <Palette size={16} weight="bold" aria-hidden="true" />
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom color" value={value} onChange={e => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}
