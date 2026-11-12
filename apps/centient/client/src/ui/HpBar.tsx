// A retro game HP bar: ten blocks that fill with the value. Mini (in a list row, read only) or big (the divide
// dialog), where a native range input on top makes it draggable by thumb, keyboard and screen reader.
type Props = {
  value: number;
  max: number;
  /** Draggable: reports the new value. Leave out for a read-only bar. */
  onChange?: (v: number) => void;
  /** Read aloud for the slider (e.g. "Kulkas"). */
  label?: string;
  size?: 'mini' | 'big';
};

const BLOCKS = 10;

export function HpBar({ value, max, onChange, label, size = 'mini' }: Props) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  // A sliver of a payment still lights a block, so "paid a bit" never reads as "paid nothing".
  const lit = ratio === 0 ? 0 : Math.max(1, Math.floor(ratio * BLOCKS));
  const full = ratio >= 1;
  const big = size === 'big';
  return (
    <span
      className={`relative inline-flex shrink-0 items-center gap-[2px] border border-edge bg-raised-2 p-[2px] ${big ? 'h-7 w-full rounded-md' : 'h-3 w-[72px] rounded-[3px]'}`}
      aria-hidden={onChange ? undefined : true}
    >
      {Array.from({ length: BLOCKS }, (_, i) => (
        <span
          key={i}
          className={`h-full flex-1 ${big ? 'rounded-[3px]' : 'rounded-[1px]'} ${
            i < lit ? (full ? 'bg-ok' : 'bg-miku') : 'bg-transparent'
          } transition-colors duration-150`}
        />
      ))}
      {onChange && (
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label={label}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      )}
    </span>
  );
}
