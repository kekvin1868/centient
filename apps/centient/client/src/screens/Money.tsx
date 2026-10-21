// Money: where the money is (accounts), what it's for (Pockets), and budgets for this month.
import { Block, BlockFooter, Button, Progressbar } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { Account, Envelope } from '../../../src/application/ports';
import { call, client } from '../api';
import { AmountField } from '../components/AmountField';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { PickerRow } from '../components/Fields';
import { Group, Row } from '../components/List';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { ACCOUNT_KINDS, formatMoney } from '../lib/format';
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
  const pocketLabel = (e: Envelope & { balance: number }) => e.kind === 'GOAL' && e.target_amount
    ? `${Math.min(100, Math.max(0, Math.round((e.balance / e.target_amount) * 100)))}% of ${formatMoney(e.target_amount, e.currency_code)}${e.target_date ? ` by ${e.target_date}` : ''}`
    : e.kind === 'SAVINGS' ? 'Savings' : 'Spending';
  const days = budgets.cycle.daysLeft;
  const usualId = active(cat.accounts).find(a => a.kind !== 'IOU')?.default_envelope_id;
  const usual = (usualId && nameOf(cat.envelopes, usualId)) || bal.envelopes.find(e => e.kind === 'SPENDING')?.name;

  return (
    <main className="screen">
      <h1 className="screen-title">Money</h1>

      <Group label="Accounts" foot={[...totals].map(([c, v]) => `Total ${formatMoney(v, c)}`).join(' · ')}>
        {bal.accounts.map(a => (
          <Row key={a.id} title={a.name} sub={ACCOUNT_KINDS[a.kind]} chevron onClick={() => setAccount(a)}
            trail={<span className={`num ${a.balance < 0 ? 'text-red-500' : ''}`}>{formatMoney(a.balance, a.currency_code)}</span>} />
        ))}
      </Group>

      <Group label="Pockets" foot={`New money lands in each account's usual Pocket${usual ? ` (${usual})` : ''}. Tap a Pocket to put money into it.`}>
        {bal.envelopes.map(e => (
          <Row key={e.id} title={e.name} trail={formatMoney(e.balance, e.currency_code)} chevron
            onClick={() => setMove({ from: bal.envelopes.find(x => x.id !== e.id && x.kind === 'SPENDING' && x.currency_code === e.currency_code)?.id ?? null, to: e.id })}
            sub={<>{pocketLabel(e)}{e.kind === 'GOAL' && e.target_amount ? <Progressbar className="mt-1.5" progress={Math.min(1, Math.max(0, e.balance / e.target_amount))} /> : null}</>} />
        ))}
      </Group>
      <Block><Button large tonal onClick={() => setMove({ from: null, to: null })}>Move money between Pockets</Button></Block>

      <Group label={`Budgets · ${days} day${days === 1 ? '' : 's'} left`}>
        {!budgets.budgets.length && <Row title={<span className="opacity-60">No budgets yet. A budget shows what you can still spend each day.</span>} />}
        {budgets.budgets.map(b => {
          const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && nameOf(cat.envelopes, b.envelopeId)].filter(Boolean).join(' in ');
          const over = b.remaining < 0;
          return (
            <Row key={b.id} onClick={() => setBudget(b)}
              title={<>{b.categoryId ? `${categoryEmoji(nameOf(cat.categories, b.categoryId))} ` : ''}{name}</>}
              trail={over ? <span className="text-sm text-red-500">{formatMoney(-b.remaining)} over</span> : <span className="text-sm opacity-60">{formatMoney(b.remaining)} left</span>}
              sub={<>{formatMoney(b.spent)} of {formatMoney(b.limit)}{b.safePerDay !== null && !over ? ` · ${formatMoney(b.safePerDay)}/day` : ''}
                <Progressbar className={`mt-1.5 ${over ? 'k-color-brand-red' : ''}`} progress={Math.min(1, b.percent / 100)} /></>} />
          );
        })}
      </Group>
      <Block><Button large tonal onClick={() => setBudget('new')}>Set a budget</Button></Block>

      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <AccountSheet key={`account:${account?.id ?? 'none'}`} account={account} onClose={() => setAccount(null)} onShow={() => { selectedAccount.value = account!.id; setAccount(null); onShowAccount(); }} />
      <MoveSheet key={`move:${move ? `${move.from}:${move.to}` : 'none'}`} preset={move} pockets={bal.envelopes} onClose={() => setMove(null)} />
      <BudgetSheet key={`budget:${budget === 'new' ? 'new' : budget?.id ?? 'none'}`} budget={budget} onClose={() => setBudget(null)} />
    </main>
  );
}

function AccountSheet({ account, onClose, onShow }: { account: (Account & { balance: number }) | null; onClose: () => void; onShow: () => void }) {
  const [actual, setActual] = useState<number | null>(null);
  const [step, setStep] = useState<'menu' | 'update'>('menu');
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
      <div className="mx-4 my-4"><div className="text-[13px] opacity-60">Centient shows</div><div className="num text-[32px] font-bold tracking-tight">{formatMoney(account.balance, cur)}</div>
        {account.reconciled_at && <div className="text-[13px] opacity-60">Last checked {account.reconciled_at.slice(0, 10)}</div>}</div>
      {step === 'menu' ? (
        <Block className="flex flex-col gap-2.5">
          <Button large onClick={() => setStep('update')}>Update balance</Button>
          <Button large tonal onClick={onShow}>Show its activity</Button>
        </Block>
      ) : (
        <>
          <Group>
            <AmountField label="What does your bank app show?" currency={cur} value={actual} onChange={setActual} autoFocus />
          </Group>
          {actual !== null && diff !== 0 && (
            <>
              <BlockFooter>{formatMoney(Math.abs(diff), cur)} {diff < 0 ? 'less' : 'more'} than Centient had.</BlockFooter>
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
            <Button large disabled={actual === null} onClick={save}>
              {actual !== null && diff !== 0 && !categoryId ? 'Skip and update' : diff === 0 && actual !== null ? 'Mark as checked' : 'Update'}
            </Button>
          </Block>
        </>
      )}
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
      <Block><Button large disabled={Boolean(error)} onClick={save}>{error ?? 'Move'}</Button></Block>
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
          <Button large disabled={Boolean(error)} onClick={save}>{error ?? 'Save'}</Button>
          {editing && <Button large tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Remove budget</Button>}
        </Block>
      </Sheet>
      <ConfirmSheet open={confirm} message="Remove this budget? Your entries stay." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </>
  );
}
