// Pick the account Home shows from a dealt hand; the joker is "all accounts".
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { everyday, selectedAccount } from '../../lib/state';
import { Sheet } from '../../ui/Sheet';
import { AccountHand } from './AccountHand';

export function AccountPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [bal, setBal] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    attempt(async () => {
      const b = await call(client.api.balances.$get());
      setBal(Object.fromEntries(b.accounts.map(a => [a.id, a.balance])));
    });
  }, [open]);
  const pick = (id: string | null) => {
    selectedAccount.value = id;
    setTimeout(onClose, 380); // let the card finish lifting before the sheet goes
  };
  return (
    <Sheet open={open} onClose={onClose} title="Pick an account">
      <div className="pt-6 pb-2">
        <AccountHand selected={selectedAccount.value} onPick={pick} label="Show account"
          cards={[{ id: null, name: 'All accounts', kind: 'ALL' }, ...everyday().map(a => ({ id: a.id, name: a.name, kind: a.kind, balance: bal[a.id], currency: a.currency_code }))]} />
      </div>
    </Sheet>
  );
}
