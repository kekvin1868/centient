// Pick the account Home shows from a dealt hand; the joker is "all accounts".
import { useQuery } from '@tanstack/react-query';
import { everyday, selectedAccount } from '../../lib/state';
import { useBalances } from '../../models/useWaiting';
import { Sheet } from '../../ui/Sheet';
import { AccountHand } from './AccountHand';

export function AccountPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useBalances(open);
  const bal = Object.fromEntries((data?.accounts ?? []).map(a => [a.id, a.balance]));
  const pick = (id: string | null) => {
    selectedAccount.value = id;
    setTimeout(onClose, 380); // let the card finish lifting before the sheet goes
  };
  return (
    <Sheet open={open} onClose={onClose} title="Pick an account">
      <div className="pt-6 pb-2">
        <AccountHand
          selected={selectedAccount.value}
          onPick={pick}
          label="Show account"
          cards={[
            { id: null, name: 'All accounts', kind: 'ALL' },
            ...everyday().map(a => ({
              id: a.id,
              name: a.name,
              kind: a.kind,
              balance: bal[a.id],
              currency: a.currency_code,
            })),
          ]}
        />
      </div>
    </Sheet>
  );
}
