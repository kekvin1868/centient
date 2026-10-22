// Which account Home shows. Opens the hand of account cards.
import { CaretDown, Cards } from '@phosphor-icons/react';
import { everyday, selectedAccount } from '../../lib/state';

export function AccountChip({ onOpen }: { onOpen: () => void }) {
  const sel = selectedAccount.value;
  const acc = sel ? everyday().find(a => a.id === sel) : null;
  return (
    // Fixed width, so switching accounts does not shift the header; long names end in "…".
    <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`Showing ${acc?.name ?? 'all accounts'}. Change account`}
      className={`rarity-${acc?.kind ?? 'ALL'} panel flex h-11 max-w-[60%] items-center gap-2 rounded-xl bg-white pl-1.5 pr-2.5 dark:bg-raised active:opacity-80`}>
      <span className="grid h-7 w-6 shrink-0 place-items-center rounded-[5px] border border-edge bg-[var(--rarity)] text-[#0b0f0f]" aria-hidden="true"><Cards size={14} weight="bold" /></span>
      <span className="min-w-0 truncate text-left text-[16px] font-bold leading-none">{acc?.name ?? 'All accounts'}</span>
      <CaretDown className="shrink-0" size={14} weight="bold" aria-hidden="true" />
    </button>
  );
}
