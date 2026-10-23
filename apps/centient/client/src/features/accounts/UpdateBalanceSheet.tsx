// Update balance: type what the bank app shows; the difference is logged, optionally in a category.
import { Block, BlockFooter, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { categoryEmoji } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { active, catalog, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { BigMoney } from '../../ui/BigMoney';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export function UpdateBalanceSheet({ account, onClose }: { account: (Account & { balance: number }) | null; onClose: () => void }) {
  const [actual, setActual] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  if (!account) return null;
  const cur = account.currency_code;
  const diff = actual === null ? 0 : actual - account.balance;
  const cats = active(catalog.value.categories).filter(c => c.kind === (diff < 0 ? 'EXPENSE' : 'INCOME') && !['Balance adjustment', 'Opening balance'].includes(c.name));

  const save = async () => {
    if (actual === null) return;
    const ok = await attempt(() => call(client.api.accounts[':id'].balance.$post({ param: { id: account.id }, json: { actual, categoryId } })));
    if (ok) { onClose(); showToast(diff === 0 ? 'Marked as checked' : 'Balance updated'); await refresh(); }
  };

  return (
    <Sheet open onClose={onClose} title={account.name}>
      <div className="mx-4 my-5">
        <div className="text-[15px] font-semibold text-muted">Centient shows</div>
        <BigMoney minor={account.balance} currency={cur} max={48} className="my-3" />
        {account.reconciled_at && <div className="text-[13px] text-muted">Last checked {account.reconciled_at.slice(0, 10)}</div>}
      </div>
      <Group>
        <AmountField label="What does your bank app show?" currency={cur} value={actual} onChange={setActual} autoFocus />
      </Group>
      {actual !== null && diff !== 0 && (
        <>
          <BlockFooter inset>{formatMoney(Math.abs(diff), cur)} {diff < 0 ? 'less' : 'more'} than Centient had.</BlockFooter>
          <Group label={diff < 0 ? 'Where did it go?' : 'Where did it come from?'} foot="Optional. Picking one counts it in that category's budget.">
            <li className="flex flex-wrap gap-2 p-3">
              {cats.map(c => (
                <Button key={c.id} small rounded inline tonal={categoryId !== c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                  {categoryEmoji(c.name, c.kind)} {c.name}
                </Button>
              ))}
            </li>
          </Group>
        </>
      )}
      <Block>
        <Button large rounded disabled={actual === null} onClick={save}>
          {actual !== null && diff !== 0 && !categoryId ? 'Skip and update' : diff === 0 && actual !== null ? 'Mark as checked' : 'Update'}
        </Button>
      </Block>
    </Sheet>
  );
}
