// A row of pocket stamps: tap one to pick it. Main counts as "none picked" (null), so its money goes where the
// account's new money goes. Used under the log box and in the Paid back sheet.
import type { CSSProperties } from 'react';
import { pocketColor } from '../../lib/pocketColors';

type Pocket = { id: string; name: string; color: string | null };

export function PocketStamps({
  label,
  pockets,
  mainId,
  value,
  onChange,
}: {
  label: string;
  pockets: Pocket[];
  mainId: string | null;
  value: string | null;
  onChange: (pocket: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {pockets.map((e, i) => (
        <button
          key={e.id}
          type="button"
          aria-pressed={e.id === (value ?? mainId)}
          onClick={() => onChange(e.id === mainId ? null : e.id)}
          className="receipt-stamp-btn active:opacity-70"
          style={
            {
              '--sc': `color-mix(in oklab, ${pocketColor(e.color, i, i === 0)} 60%, #0b0f10)`,
            } as CSSProperties
          }
        >
          {e.name.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
