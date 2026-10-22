// Money: the total, accounts as a hand of cards (tap one for its actions), Pockets as a wallet stack, budgets.
import { Block, BlockFooter, BlockTitle, Button, Progressbar } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { Account, Envelope } from '../../../src/application/ports';
import { call, client } from '../api';
import { AccountHand } from '../components/AccountHand';
import { AmountField } from '../components/AmountField';
import { BigMoney } from '../components/BigMoney';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { PickerRow } from '../components/Fields';
import { PocketStack } from '../components/PocketStack';
import { Group, Row } from '../components/List';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { formatMoney } from '../lib/format';
import { categoryEmoji } from '../lib/labels';
import { attempt } from '../lib/run';
import { active, catalog, me, nameOf, refresh, selectedAccount, version } from '../state';

type Bal = { accounts: (Account & { balance: number })[]; envelopes: (Envelope & { balance: number })[] };
type BudgetRow = { id: string; categoryId: string | null; envelopeId: string | null; limit: number; spent: number; remaining: number; percent: number; safePerDay: number | null };

type Budgets = { cycle: { from: string; to: string; daysLeft: number }; budgets: BudgetRow[] };
// Last data shown, so coming back to Money shows it at once while it refreshes.
let cache: { bal: Bal; budgets: Budgets } | null = null;

export function Money({ onShowAccount }: { onShowAccount: () => void }) {
  const [bal, setBal] = useState<Bal | null>(cache?.bal ?? null);
  const [budgets, setBudgets] = useState<Budgets | null>(cache?.budgets ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [account, setAccount] = useState<(Account & { balance: number }) | null>(null);
  const [move, setMove] = useState<{ from: string | null; to: string | null } | null>(null);
  const [budget, setBudget] = useState<BudgetRow | 'new' | null>(null);

  useEffect(() => {
    attempt(async () => {
      const [b, g] = await Promise.all([call(client.api.balances.$get()), call(client.api.budgets.$get({ query: {} }))]);
      setBal(b as Bal);
      setBudgets(g);
      cache = { bal: b as Bal, budgets: g };
    });
  }, [version.value]);
  if (!bal || !budgets) return <main className="screen"><h1 className="screen-title">Money</h1></main>;

  const totals = new Map<string, number>();
  for (const a of bal.accounts) totals.set(a.currency_code, (totals.get(a.currency_code) ?? 0) + a.balance);
  const cat = catalog.value;
  const days = budgets.cycle.daysLeft;
  const usualId = active(cat.accounts).find(a => a.kind !== 'IOU')?.default_envelope_id;
  const usual = (usualId && nameOf(cat.envelopes, usualId)) || bal.envelopes.find(e => e.kind === 'SPENDING')?.name;

  return (
    <main className="screen">
      <h1 className="screen-title">Money</h1>
      <div className="mx-4 mt-4">
        <div className="text-[15px] font-semibold text-muted">Total balance</div>
        <BigMoney minor={totals.get('IDR') ?? 0} max={60} className="mt-3" />
        {[...totals].filter(([c]) => c !== 'IDR').map(([c, v]) => <div key={c} className="num mt-2 font-semibold text-muted">+ {formatMoney(v, c)}</div>)}
      </div>

      <BlockTitle medium className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]">Accounts</BlockTitle>
      <AccountHand selected={picked} onPick={setPicked}
        cards={bal.accounts.map(a => ({ id: a.id, name: a.name, kind: a.kind, balance: a.balance, currency: a.currency_code }))} />
      <PickedAccount account={bal.accounts.find(a => a.id === picked) ?? null}
        onUpdate={a => setAccount(a)} onShow={a => { selectedAccount.value = a.id; onShowAccount(); }} />

      <BlockTitle medium className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]">Pockets</BlockTitle>
      <PocketStack pockets={bal.envelopes}
        onAdd={id => setMove({ from: bal.envelopes.find(x => x.id !== id && x.kind === 'SPENDING' && x.currency_code === bal.envelopes.find(e => e.id === id)?.currency_code)?.id ?? null, to: id })}
        onMoveOut={id => setMove({ from: id, to: null })} />
      <BlockFooter inset>New money lands in each account's usual Pocket{usual ? ` (${usual})` : ''}. Tap a Pocket to add money to it.</BlockFooter>
      <Block><Button large rounded tonal onClick={() => setMove({ from: null, to: null })}>Move money between Pockets</Button></Block>

      <Group label={`Budgets · ${days} day${days === 1 ? '' : 's'} left`}>
        {!budgets.budgets.length && <Row title={<span className="text-muted">No budgets yet. A budget shows what you can still spend each day.</span>} />}
        {budgets.budgets.map(b => {
          const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && nameOf(cat.envelopes, b.envelopeId)].filter(Boolean).join(' in ');
          const over = b.remaining < 0;
          return (
            <Row key={b.id} onClick={() => setBudget(b)}
              title={<>{b.categoryId ? `${categoryEmoji(nameOf(cat.categories, b.categoryId))} ` : ''}{name}</>}
              trail={over ? <span className="k-color-brand-red text-sm font-semibold text-primary">{formatMoney(-b.remaining)} over</span> : <span className="text-sm font-semibold text-muted">{formatMoney(b.remaining)} left</span>}
              sub={<>{formatMoney(b.spent)} of {formatMoney(b.limit)}{b.safePerDay !== null && !over ? ` · ${formatMoney(b.safePerDay)}/day` : ''}
                <Progressbar className={`mt-1.5 ${over ? 'k-color-brand-red' : ''}`} progress={Math.min(1, b.percent / 100)} /></>} />
          );
        })}
      </Group>
      <Block><Button large rounded tonal onClick={() => setBudget('new')}>Set a budget</Button></Block>

      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <AccountSheet key={`account:${account?.id ?? 'none'}`} account={account} onClose={() => setAccount(null)} />
      <MoveSheet key={`move:${move ? `${move.from}:${move.to}` : 'none'}`} preset={move} pockets={bal.envelopes} onClose={() => setMove(null)} />
      <BudgetSheet key={`budget:${budget === 'new' ? 'new' : budget?.id ?? 'none'}`} budget={budget} onClose={() => setBudget(null)} />
    </main>
  );
}

/** The lifted card's details, under the hand: balance and what you can do with the account. */
function PickedAccount({ account: a, onUpdate, onShow }: { account: (Account & { balance: number }) | null; onUpdate: (a: Account & { balance: number }) => void; onShow: (a: Account) => void }) {
  return (
    <div className="grid px-4" style={{ gridTemplateRows: a ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(.34,1.3,.64,1)' }}>
      <div className="overflow-hidden">
        {a ? (
          <div className="pb-2 pt-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{a.name}</span>
              {a.reconciled_at && <span className="shrink-0 text-[13px] text-muted">Checked {a.reconciled_at.slice(0, 10)}</span>}
            </div>
            <BigMoney minor={a.balance} currency={a.currency_code} max={40} className={`mt-2 ${a.balance < 0 ? 'text-negative' : ''}`} />
            <div className="mt-4 flex gap-3">
              <Button large rounded className="flex-1" onClick={() => onUpdate(a)}>Update balance</Button>
              <Button large rounded tonal className="flex-1" onClick={() => onShow(a)}>Activity</Button>
            </div>
          </div>
        ) : <p className="pb-2 text-center text-[15px] text-muted">Tap a card to update its balance or see its activity.</p>}
      </div>
    </div>
  );
}

function AccountSheet({ account, onClose }: { account: (Account & { balance: number }) | null; onClose: () => void }) {
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
      <div className="mx-4 my-5"><div className="text-[15px] font-semibold text-muted">Centient shows</div><BigMoney minor={account.balance} currency={cur} max={48} className="my-3" />
        {account.reconciled_at && <div className="text-[13px] text-muted">Last checked {account.reconciled_at.slice(0, 10)}</div>}</div>
      <>
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
      </>
    </Sheet>
  );
}

/** Moves money between Pockets. Opened from a Pocket row, `preset.to` is that Pocket ("Add money to Savings"). */
function MoveSheet({ preset, pockets, onClose }: { preset: { from: string | null; to: string | null } | null; pockets: (Envelope & { balance: number })[]; onClose: () => void }) {
  const [from, setFrom] = useState<string | null>(preset?.from ?? null);
  const [to, setTo] = useState<string | null>(preset?.to ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  if (!preset) return null;
  const opts = pockets.map(p => ({ value: p.id, label: `${p.name} · ${formatMoney(p.balance, p.currency_code)}` }));
  const target = preset.to ? pockets.find(p => p.id === preset.to)?.name : null;
  const error = !from || !to ? 'Pick both Pockets' : from === to ? 'Pick two different Pockets' : !amount ? 'Enter an amount' : null;
  const save = async () => {
    if (error) return;
    const ok = await attempt(() => call(client.api.transactions.$post({
      json: { type: 'ALLOCATE', fromEnvelopeId: from!, toEnvelopeId: to!, amount: amount!, date: me.value!.today },
    })));
    if (ok) { onClose(); showToast('Moved'); await refresh(); }
  };
  return (
    <Sheet open onClose={onClose} title={target ? `Add money to ${target}` : 'Move money'}>
      <Group foot="This sets money aside for a different purpose. Your account balances don't change.">
        <PickerRow label="From" value={from} options={opts} onChange={setFrom} />
        <PickerRow label="To" value={to} options={opts} onChange={setTo} />
        <AmountField value={amount} currency={pockets.find(p => p.id === from)?.currency_code ?? 'IDR'} onChange={setAmount} />
      </Group>
      <Block><Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Move'}</Button></Block>
    </Sheet>
  );
}

function BudgetSheet({ budget, onClose }: { budget: BudgetRow | 'new' | null; onClose: () => void }) {
  const initial = budget === 'new' ? null : budget;
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [envelopeId, setEnvelopeId] = useState<string | null>(initial?.envelopeId ?? null);
  const [limit, setLimit] = useState<number | null>(initial?.limit ?? null);
  const [confirm, setConfirm] = useState(false);
  if (!budget) return null;
  const cat = catalog.value;
  const editing = budget !== 'new';
  const error = !categoryId && !envelopeId ? 'Pick a category or a Pocket' : !limit ? 'Enter a limit' : null;
  const save = async () => {
    if (error) return;
    const ok = await attempt(() => call(client.api.budgets.$put({ json: { categoryId, envelopeId, limit: limit! } })));
    if (ok) { onClose(); showToast('Budget saved'); await refresh(); }
  };
  const remove = async () => {
    setConfirm(false);
    if (budget === 'new') return;
    const ok = await attempt(() => call(client.api.budgets[':id'].$delete({ param: { id: budget.id } })));
    if (ok) { onClose(); showToast('Budget removed'); await refresh(); }
  };
  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={editing ? 'Budget' : 'Set a budget'}>
        <Group foot="A new limit counts from this month on; past months keep theirs.">
          <PickerRow label="Category" value={categoryId} placeholder="Any category"
            options={active(cat.categories).filter(c => c.kind === 'EXPENSE').map(c => ({ value: c.id, label: c.name }))}
            onChange={v => !editing && setCategoryId(v)} />
          <PickerRow label="Pocket" value={envelopeId} placeholder="Any Pocket"
            options={active(cat.envelopes).filter(e => e.kind === 'SPENDING').map(e => ({ value: e.id, label: e.name }))}
            onChange={v => !editing && setEnvelopeId(v)} />
          <AmountField label="Limit per month" value={limit} onChange={setLimit} />
        </Group>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Save'}</Button>
          {editing && <Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Remove budget</Button>}
        </Block>
      </Sheet>
      <ConfirmSheet open={confirm} message="Remove this budget? Your entries stay." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </>
  );
}
