// Money: the total, accounts as cards (tap one for its balance, actions, pockets and installments), budgets.
// Pockets live inside an account (like Jago's Kantong): the account's balance is the sum of its pockets.
import { Block, BlockFooter, BlockTitle, Button, Progressbar } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { Account, Envelope } from '../../../src/application/ports';
import { call, client } from '../api';
import { AccountHand } from '../components/AccountHand';
import { AmountField } from '../components/AmountField';
import { BigMoney } from '../components/BigMoney';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { InstallmentsSection, takesInstallments } from '../components/Installments';
import { InputRow, PickerRow } from '../components/Fields';
import { Segmented } from '../components/Segmented';
import { PocketStack } from '../components/PocketStack';
import { Group, Row } from '../components/List';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { formatMoney } from '../lib/format';
import { categoryEmoji } from '../lib/labels';
import { idrValue, loadPrices, priceAge, prices } from '../lib/prices';
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
  const [move, setMove] = useState<{ accountId: string; from: string | null; to: string | null } | null>(null);
  const [addPocket, setAddPocket] = useState<Account | null>(null);
  const [budget, setBudget] = useState<BudgetRow | 'new' | null>(null);

  useEffect(() => {
    loadPrices();
    attempt(async () => {
      const [b, g] = await Promise.all([call(client.api.balances.$get()), call(client.api.budgets.$get({ query: {} }))]);
      setBal(b as Bal);
      setBudgets(g);
      cache = { bal: b as Bal, budgets: g };
    });
  }, [version.value]);
  if (!bal || !budgets) return <main className="screen"><h1 className="screen-title">Money</h1></main>;

  // Rupiah total; crypto counts at its last known price (marked ≈), other currencies are listed apart.
  let total = 0, cryptoIdr = 0;
  const unpriced = new Map<string, number>();
  const priced = new Set<string>();
  for (const a of bal.accounts) {
    const v = idrValue(a.balance, a.currency_code, prices.value);
    if (v === null) unpriced.set(a.currency_code, (unpriced.get(a.currency_code) ?? 0) + a.balance);
    else { total += v; if (a.currency_code !== 'IDR') { cryptoIdr += v; priced.add(a.currency_code); } }
  }
  const age = [...priced].map(c => priceAge(c)).find(Boolean);
  const cat = catalog.value;
  const days = budgets.cycle.daysLeft;

  return (
    <main className="screen">
      <h1 className="screen-title">Money</h1>
      <div className="mx-4 mt-4">
        <div className="text-[15px] font-semibold text-muted">Total balance{priced.size ? ' ≈' : ''}</div>
        <BigMoney minor={total} max={60} className="mt-3" />
        {priced.size > 0 && (
          <div className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}>
            Includes ≈ {formatMoney(cryptoIdr)} in crypto · {age?.stale ? 'last known price, ' : 'price '}{age?.label}
          </div>
        )}
        {[...unpriced].map(([c, v]) => <div key={c} className="num mt-2 font-semibold text-muted">+ {formatMoney(v, c)} (not in the total)</div>)}
      </div>

      <BlockTitle medium className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]">
        Accounts <span className="ml-1 text-[15px] font-bold text-muted">{bal.accounts.length}</span>
      </BlockTitle>
      <AccountHand selected={picked} onPick={setPicked}
        cards={bal.accounts.map(a => {
          const v = a.currency_code === 'IDR' ? null : idrValue(a.balance, a.currency_code, prices.value);
          return { id: a.id, name: a.name, kind: a.kind, balance: a.balance, currency: a.currency_code, note: v !== null ? `≈ ${formatMoney(v)}` : undefined };
        })} />
      <PickedAccount account={bal.accounts.find(a => a.id === picked) ?? null} pockets={bal.envelopes.filter(e => e.account_id === picked)}
        onUpdate={a => setAccount(a)} onShow={a => { selectedAccount.value = a.id; onShowAccount(); }}
        onMove={setMove} onAddPocket={setAddPocket} />

      <Group label={`Budgets · ${days} day${days === 1 ? '' : 's'} left`}>
        {!budgets.budgets.length && <Row title={<span className="text-muted">No budgets yet. A budget shows what you can still spend each day.</span>} />}
        {budgets.budgets.map(b => {
          const name = [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)].filter(Boolean).join(' in ');
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
      <MoveSheet key={`move:${move ? `${move.accountId}:${move.from}:${move.to}` : 'none'}`} preset={move}
        pockets={bal.envelopes.filter(e => e.account_id === move?.accountId && !e.archived_at)} onClose={() => setMove(null)} />
      <AddPocketSheet key={`add-pocket:${addPocket?.id ?? 'none'}`} account={addPocket} onClose={() => setAddPocket(null)} />
      <BudgetSheet key={`budget:${budget === 'new' ? 'new' : budget?.id ?? 'none'}`} budget={budget} onClose={() => setBudget(null)} />
    </main>
  );
}

type Pocket = Envelope & { balance: number };
type Move = { accountId: string; from: string | null; to: string | null };

/** "BCA · Rent": a pocket named with its account. */
function pocketLabel(id: string) {
  const cat = catalog.value;
  const e = cat.envelopes.find(x => x.id === id);
  return e ? `${nameOf(cat.accounts, e.account_id)} · ${e.name}` : '';
}

/** The lifted card's details, under the cards: balance, actions, its pockets, and installments. */
function PickedAccount({ account: a, pockets, onUpdate, onShow, onMove, onAddPocket }: {
  account: (Account & { balance: number }) | null; pockets: Pocket[]; onUpdate: (a: Account & { balance: number }) => void; onShow: (a: Account) => void;
  onMove: (m: Move) => void; onAddPocket: (a: Account) => void;
}) {
  return (
    <div className="mt-4 grid px-4" style={{ gridTemplateRows: a ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(.34,1.3,.64,1)' }}>
      <div className="overflow-hidden">
        {a ? (
          <div className="pb-2 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{a.name}</span>
              {a.reconciled_at && <span className="shrink-0 text-[13px] text-muted">Checked {a.reconciled_at.slice(0, 10)}</span>}
            </div>
            <BigMoney minor={a.balance} currency={a.currency_code} max={40} className={`mt-2 ${a.balance < 0 ? 'text-negative' : ''}`} />
            {a.currency_code !== 'IDR' && <CryptoValue account={a} />}
            <div className="mt-4 flex gap-3">
              <Button large rounded className="flex-1" onClick={() => onUpdate(a)}>Update balance</Button>
              <Button large rounded tonal className="flex-1" onClick={() => onShow(a)}>Activity</Button>
            </div>
            {a.kind !== 'IOU' && (
              <section className="mt-6" aria-label={`Pockets in ${a.name}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Pockets</h3>
                  <span className="text-[13px] font-semibold text-muted">Inside {a.name}</span>
                </div>
                <div className="-mx-4">
                  <PocketStack pockets={pockets.filter(p => !p.archived_at)} mainId={a.default_envelope_id}
                    onAdd={id => onMove({ accountId: a.id, from: a.default_envelope_id, to: id })}
                    onMoveOut={id => onMove({ accountId: a.id, from: id, to: id === a.default_envelope_id ? null : a.default_envelope_id })} />
                </div>
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={() => onAddPocket(a)}
                    className="panel flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80">+ Add pocket</button>
                  {pockets.length > 1 && (
                    <button type="button" onClick={() => onMove({ accountId: a.id, from: null, to: null })}
                      className="panel flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80">Move between</button>
                  )}
                </div>
                <p className="mt-2 text-[13px] text-muted">New money lands in Main. Pockets set some of {a.name}'s money aside; its balance stays the same.</p>
              </section>
            )}
            {takesInstallments(a.kind) && <InstallmentsSection key={a.id} account={a} />}
          </div>
        ) : <p className="pb-2 text-center text-[15px] text-muted">Tap a card to update its balance or see its activity.</p>}
      </div>
    </div>
  );
}

/** What a crypto balance is worth in rupiah, with how fresh the price is. */
function CryptoValue({ account: a }: { account: Account & { balance: number } }) {
  const v = idrValue(a.balance, a.currency_code, prices.value);
  const age = priceAge(a.currency_code);
  if (v === null) return <div className="mt-2 text-[14px] text-muted">No rupiah price for {a.currency_code}; it isn't in the total.</div>;
  return (
    <div className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}>
      ≈ {formatMoney(v)} · {age?.stale ? 'last known price, ' : ''}{age?.label}
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

/** Moves money between pockets of one account. Opened from a pocket, `preset.to` is that pocket ("Add money to Rent"). */
function MoveSheet({ preset, pockets, onClose }: { preset: Move | null; pockets: Pocket[]; onClose: () => void }) {
  const [from, setFrom] = useState<string | null>(preset?.from ?? null);
  const [to, setTo] = useState<string | null>(preset?.to ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  if (!preset) return null;
  const opts = pockets.map(p => ({ value: p.id, label: `${p.name} · ${formatMoney(p.balance, p.currency_code)}` }));
  const target = preset.to ? pockets.find(p => p.id === preset.to)?.name : null;
  const error = !from || !to ? 'Pick both pockets' : from === to ? 'Pick two different pockets' : !amount ? 'Enter an amount' : null;
  const save = async () => {
    if (error) return;
    const ok = await attempt(() => call(client.api.transactions.$post({
      json: { type: 'ALLOCATE', fromEnvelopeId: from!, toEnvelopeId: to!, amount: amount!, date: me.value!.today },
    })));
    if (ok) { onClose(); showToast('Moved'); await refresh(); }
  };
  return (
    <Sheet open onClose={onClose} title={target ? `Add money to ${target}` : 'Move money'}>
      <Group foot={`Moves money inside ${nameOf(catalog.value.accounts, preset.accountId)}. Its balance doesn't change.`}>
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
  const error = !categoryId && !envelopeId ? 'Pick a category or a pocket' : !limit ? 'Enter a limit' : null;
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
          <PickerRow label="Pocket" value={envelopeId} placeholder="Any pocket"
            options={active(cat.envelopes).filter(e => e.kind === 'SPENDING' && cat.accounts.find(x => x.id === e.account_id)?.kind !== 'IOU').map(e => ({ value: e.id, label: pocketLabel(e.id) }))}
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

const POCKET_KINDS: Record<Envelope['kind'], string> = { SPENDING: 'Spending', SAVINGS: 'Savings', GOAL: 'Goal' };

/** Adds a pocket inside one account. */
function AddPocketSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Envelope['kind']>('SAVINGS');
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState('');
  if (!account) return null;
  const error = !name.trim() ? 'Name the pocket' : kind === 'GOAL' && !target ? 'Enter the goal amount' : null;
  const save = () => attempt(async () => {
    await call(client.api.envelopes.$post({ json: { accountId: account.id, name: name.trim(), kind, targetAmount: kind === 'GOAL' ? target : null, targetDate: kind === 'GOAL' && date ? date : null } }));
    onClose();
    showToast(`Added to ${account.name}`);
    await refresh();
  });
  return (
    <Sheet open onClose={onClose} title={`New pocket in ${account.name}`}>
      <Segmented label="Kind" value={kind} onChange={setKind} options={(Object.keys(POCKET_KINDS) as Envelope['kind'][]).map(k => ({ value: k, label: POCKET_KINDS[k] }))} />
      <Group foot="Move money into it from Main whenever you like.">
        <InputRow label="Name" value={name} placeholder={kind === 'GOAL' ? 'e.g. Japan trip' : 'e.g. Rent'} onInput={setName} />
        {kind === 'GOAL' && <><AmountField label="Goal" value={target} currency={account.currency_code} onChange={setTarget} /><InputRow label="By" type="date" value={date} onInput={setDate} /></>}
      </Group>
      <Block><Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Add pocket'}</Button></Block>
    </Sheet>
  );
}
