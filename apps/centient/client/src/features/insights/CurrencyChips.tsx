// One currency at a time, never summed: a chip per currency with activity in the period. Hidden with only one.
export function CurrencyChips({
  currencies,
  value,
  onChange,
}: {
  currencies: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  if (currencies.length < 2) return null;
  return (
    <div className="mx-4 mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Currency">
      {currencies.map(c => {
        const on = c === value;
        return (
          <button
            key={`cur:${c}`}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            className={`panel min-w-14 px-3 py-1.5 text-sm font-semibold ${on ? 'bg-miku text-on-miku' : 'bg-raised text-ink'}`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
