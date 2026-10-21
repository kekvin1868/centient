// Home: what's left, a log box that previews entries as you type, and recent activity.
import { parseQuickAdd } from '@centient/quickadd';
import { CaretDown, WifiSlash } from '@phosphor-icons/react';
import { Block, Button, List } from 'konsta/react';
import { useEffect, useMemo, useState } from 'react';
import { call, client, OfflineError } from '../api';
import { AmountField } from '../components/AmountField';
import { Banner } from '../components/Banner';
import { Chip } from '../components/Chip';
import { EntryForm } from '../components/EntryForm';
import { EntryList, type Entry } from '../components/EntryList';
import { EntrySheet } from '../components/EntrySheet';
import { InputRow, PickerRow } from '../components/Fields';
import { Group } from '../components/List';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { ACCOUNT_KINDS, formatMoney } from '../lib/format';
import { blankForm, chipView, fromDraft, toCommand, type Form, type LogItem } from '../lib/form';
import { categoryEmoji, titleCase } from '../lib/labels';
import { attempt } from '../lib/run';
import { active, catalog, everyday, me, nameOf, offline, qctx, refresh, selectedAccount, version } from '../state';

export function Home({ onGoMoney }: { onGoMoney: () => void }) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [all, setAll] = useState(false);
  return (
    <main className="screen">
      <div className="flex items-center justify-between pr-4">
        <h1 className="screen-title">Centient</h1>
        <AccountSwitcher />
      </div>
      <Headline onTap={onGoMoney} />
      <LogBox />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet key={`entry:${open?.id ?? 'none'}`} entry={open} onClose={() => setOpen(null)} />
    </main>
  );
}

function AccountSwitcher() {
  const accounts = everyday();
  const sel = selectedAccount.value;
  return (
    // Fixed width, so switching accounts does not shift the header; long names end in "…".
    <label className="relative flex w-[10em] items-center justify-between gap-1 rounded-full bg-white dark:bg-ios-dark-surface-1 py-1.5 pl-3.5 pr-3 font-semibold shadow-sm cursor-pointer active:opacity-70">
      <span className="truncate">{sel ? nameOf(accounts, sel) : 'All accounts'}</span> <CaretDown className="shrink-0" size={14} weight="bold" aria-hidden="true" />
      <select className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Show account" value={sel ?? ''} onChange={e => (selectedAccount.value = (e.target as HTMLSelectElement).value || null)}>
        <option value="">All accounts</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

type Head = { label: string; big: string; sub: string };
// Last data shown, per account, so coming back to Home shows it at once instead of rebuilding the screen.
const headCache = new Map<string, Head>();
const recentCache = new Map<string, { items: Entry[]; cursor: string | null }>();

function Headline({ onTap }: { onTap: () => void }) {
  const key = selectedAccount.value ?? 'all';
  const [head, setHead0] = useState<Head | null>(headCache.get(key) ?? null);
  const setHead = (h: Head) => { headCache.set(key, h); setHead0(h); };
  useEffect(() => {
    attempt(async () => {
      const sel = selectedAccount.value;
      const bal = await call(client.api.balances.$get());
      if (sel) {
        const a = bal.accounts.find(x => x.id === sel);
        if (a) return setHead({ label: a.name, big: formatMoney(a.balance, a.currency_code), sub: ACCOUNT_KINDS[a.kind] ?? '' });
      }
      const b = await call(client.api.budgets.$get({ query: {} }));
      const startDay = me.value?.workspace.cycle_start_day ?? 1;
      if (b.budgets.length) {
        const left = b.budgets.reduce((s, x) => s + Math.max(0, x.remaining), 0);
        const perDay = b.budgets.reduce((s, x) => s + (x.safePerDay ?? 0), 0);
        return setHead({
          label: startDay === 1 ? 'Left this month' : `Left until ${b.cycle.to}`, big: formatMoney(left),
          sub: `${b.cycle.daysLeft} days · ${formatMoney(perDay)}/day`,
        });
      }
      const usual = everyday()[0]?.default_envelope_id;
      const pocket = bal.envelopes.find(e => e.id === usual) ?? bal.envelopes.find(e => e.kind === 'SPENDING' && e.currency_code === 'IDR');
      if (pocket) setHead({ label: `In ${pocket.name}`, big: formatMoney(pocket.balance, pocket.currency_code), sub: 'Set a budget on Money to see what\'s left per day' });
    });
  }, [version.value, selectedAccount.value]);
  if (!head) return <div className="mx-4 mb-5 min-h-24" />;
  return (
    <button type="button" className="mx-4 mb-5 block text-left active:opacity-70" onClick={onTap}>
      <div className="text-[13px] opacity-60">{head.label}</div>
      <div className="num text-[32px] font-bold tracking-tight">{head.big}</div>
      {head.sub && <div className="opacity-60">{head.sub}</div>}
    </button>
  );
}

// ---- log box -----------------------------------------------------------------------------

function LogBox() {
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<string, LogItem>>({});
  const [pending, setPending] = useState<LogItem[]>([]);
  const [sheet, setSheet] = useState<LogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const today = me.value?.today ?? '';
  const iou = active(catalog.value.accounts).find(a => a.kind === 'IOU')?.id ?? null;

  const live = useMemo(() => {
    if (!text.trim() || !qctx.value) return [];
    return parseQuickAdd(text, qctx.value).map((d, i) => {
      const key = `${i}:${d.text}`;
      return edits[key] ?? fromDraft(d, key, iou);
    });
  }, [text, edits, qctx.value]);
  const items = [...live, ...pending];

  const update = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.map(p => (p.key === item.key ? item : p)));
    else setEdits({ ...edits, [item.key]: item });
  };
  const remove = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.filter(p => p.key !== item.key));
    else setText(live.filter(i => i.key !== item.key).map(i => i.text).join(', '));
  };

  const submit = async () => {
    const ready = items.filter(i => chipView(i).state === 'ready');
    if (!ready.length) {
      if (items.length) showToast('Answer the question on the card first');
      return;
    }
    setSaving(true);
    try {
      await call(client.api.quickadd.save.$post({
        json: {
          items: ready.map(i => {
            const r = toCommand(i.form);
            if ('error' in r) throw new Error(r.error);
            return { command: r.command, rawMerchant: i.rawMerchant || undefined, suggestedMerchant: i.rawMerchant ? i.suggestedMerchant : undefined };
          }),
        },
      }));
    } catch (e) {
      if (e instanceof OfflineError) offline.value = true;
      else showToast((e as Error).message);
      return;
    } finally {
      setSaving(false);
    }
    offline.value = false;
    // Cards still waiting for an answer stay, detached from the cleared box.
    setPending(items.filter(i => chipView(i).state !== 'ready').map((i, n) => ({ ...i, key: `p${Date.now()}-${n}` })));
    setText('');
    setEdits({});
    showToast(ready.length === 1 ? 'Saved' : `Saved ${ready.length} entries`);
    await refresh();
  };

  // Offline: keep everything, try again as soon as the connection is back.
  useEffect(() => {
    const retry = () => { if (offline.value) submit(); };
    addEventListener('online', retry);
    return () => removeEventListener('online', retry);
  });

  const saveFromSheet = async (item: LogItem) => {
    const r = toCommand(item.form);
    if ('error' in r) return;
    const ok = await attempt(() => call(client.api.quickadd.save.$post({
      json: { items: [{ command: r.command, rawMerchant: item.rawMerchant || undefined, suggestedMerchant: item.rawMerchant ? item.suggestedMerchant : undefined }] },
    })));
    if (!ok) return;
    setSheet(null);
    remove(item);
    showToast('Saved');
    await refresh();
  };

  return (
    <section className="mb-7">
      {offline.value && <Banner><WifiSlash size={18} aria-hidden="true" /> No connection, your entry is still here.</Banner>}
      <form className="mx-4 flex items-center gap-2 rounded-2xl bg-white dark:bg-ios-dark-surface-1 py-1.5 pl-4 pr-1.5 shadow-sm" onSubmit={e => { e.preventDefault(); submit(); }}>
        <input className="min-w-0 flex-1 bg-transparent py-1 text-lg outline-none placeholder:opacity-40" value={text} placeholder="kopi 25rb gopay" aria-label="What did you spend or receive?" autoComplete="off"
          enterKeyHint="done" onChange={e => setText((e.target as HTMLInputElement).value)} />
        <Button inline rounded type="submit" disabled={saving || !items.length}>Add</Button>
      </form>
      <div className="mx-4 mt-3">
        {items.map(i => <LogChip key={i.key} item={i} today={today} onChange={update} onOpen={() => setSheet(i)} />)}
      </div>
      {!items.length && (
        <Button clear inline className="ml-2 mt-1.5" onClick={() => setSheet({
          key: `m${Date.now()}`, text: '', form: { ...blankForm(today), accountId: selectedAccount.value ?? qctx.value?.lastAccountId ?? null },
          candidates: [], askAmount: false, askCharged: false, rawMerchant: '', suggestedMerchant: '',
        })}>+ Add without typing</Button>
      )}
      <LogSheet key={sheet?.key ?? 'none'} item={sheet} onClose={() => setSheet(null)} onSave={saveFromSheet} />
    </section>
  );
}

function LogChip({ item, today, onChange, onOpen }: { item: LogItem; today: string; onChange: (i: LogItem) => void; onOpen: () => void }) {
  const [charged, setCharged] = useState<number | null>(null);
  const cat = catalog.value;
  const f = item.form;
  const v = chipView(item);
  const category = nameOf(cat.categories, f.categoryId);
  const title = f.type === 'TRANSFER'
    ? `${nameOf(cat.accounts, f.accountId) || '?'} → ${nameOf(cat.accounts, f.toAccountId) || '?'}`
    : (f.merchant ? titleCase(f.merchant) : category) || (f.type === 'INCOME' ? 'Received' : 'Spent');
  const sub = v.state === 'incomplete' ? v.missing : [
    f.type === 'TRANSFER' ? 'Moved' : f.merchant ? category : '',
    f.type !== 'TRANSFER' ? nameOf(cat.accounts, f.accountId) : '',
    f.split ? `split with ${f.split}` : '',
    f.fee ? `admin fee ${formatMoney(f.fee)}` : '',
    f.date !== today ? f.date : '',
  ].filter(Boolean).join(' · ');
  const currency = cat.accounts.find(a => a.id === f.accountId)?.currency_code ?? 'IDR';
  const set = (patch: Partial<LogItem>, form: Partial<Form> = {}) => onChange({ ...item, ...patch, form: { ...f, ...form } });

  return (
    <Chip state={v.state} emoji={categoryEmoji(category, f.type)} title={title} sub={sub}
      amount={f.amount ? formatMoney(f.amount, currency) : undefined} question={v.state === 'ask' ? v.question : undefined} onOpen={onOpen}>
      {v.state === 'ask' && v.ask === 'amount' && item.candidates.map(c => (
        <Button key={c} small rounded inline tonal={c !== f.amount} onClick={() => set({ askAmount: false }, { amount: c })}>{formatMoney(c, currency)}</Button>
      ))}
      {v.state === 'ask' && v.ask === 'account' && everyday().slice(0, 4).map(a => (
        <Button key={a.id} small rounded inline tonal onClick={() => set({}, { accountId: a.id })}>{a.name}</Button>
      ))}
      {v.state === 'ask' && v.ask === 'charged' && (
        <div className="flex w-full items-end gap-2">
          <List strong inset className="!m-0 flex-1"><AmountField label="Charged" value={charged} onChange={setCharged} /></List>
          <Button rounded inline disabled={!charged} onClick={() => set({ askCharged: false }, { amount: charged })}>OK</Button>
        </div>
      )}
    </Chip>
  );
}

function LogSheet({ item, onClose, onSave }: { item: LogItem | null; onClose: () => void; onSave: (i: LogItem) => void }) {
  const [form, setForm] = useState<Form | null>(item?.form ?? null);
  if (!item || !form) return null;
  const r = toCommand(form);
  return (
    <Sheet open onClose={onClose} title={item.text ? 'Check entry' : 'New entry'}>
      <EntryForm form={form} onChange={setForm} />
      <Block>
        <Button large disabled={'error' in r} onClick={() => onSave({ ...item, askAmount: false, askCharged: false, form })}>
          {'error' in r ? r.error : 'Save'}
        </Button>
      </Block>
    </Sheet>
  );
}

// ---- activity ------------------------------------------------------------------------------

function useEntries(filter: { account?: string | null; type?: string; from?: string; to?: string }, limit: number, cacheKey?: string) {
  const cached = cacheKey ? recentCache.get(cacheKey) : undefined;
  const [items, setItems] = useState<Entry[]>(cached?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(cached?.cursor ?? null);
  const [loaded, setLoaded] = useState(Boolean(cached));
  const load = async (more: boolean) => {
    type EntryType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'ALLOCATE';
    const query = {
      limit: String(limit), account: filter.account || undefined, type: (filter.type || undefined) as EntryType | undefined,
      from: filter.from || undefined, to: filter.to || undefined, cursor: more && cursor ? cursor : undefined,
    };
    await attempt(async () => {
      const page = await call(client.api.entries.$get({ query }));
      const next = more ? [...items, ...(page.items as Entry[])] : (page.items as Entry[]);
      setItems(next);
      setCursor(page.nextCursor);
      setLoaded(true);
      if (cacheKey && !more) recentCache.set(cacheKey, { items: next, cursor: page.nextCursor });
    });
  };
  return { items, more: cursor !== null, loaded, load };
}

function Recent({ onOpen, onSeeAll }: { onOpen: (e: Entry) => void; onSeeAll: () => void }) {
  const { items, more, loaded, load } = useEntries({ account: selectedAccount.value }, 20, selectedAccount.value ?? 'all');
  useEffect(() => { load(false); }, [version.value, selectedAccount.value]);
  if (!loaded) return null;
  return (
    <>
      <EntryList entries={items} onOpen={onOpen} empty="Nothing logged yet. Type above, for example: kopi 25rb gopay" />
      {more && <Block><Button large tonal onClick={onSeeAll}>See all</Button></Block>}
    </>
  );
}

const TYPE_FILTERS = [{ value: '', label: 'All' }, { value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' }];

function AllActivity({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (e: Entry) => void }) {
  const [type, setType] = useState('');
  const [account, setAccount] = useState<string | null>(selectedAccount.value);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { items, more, load } = useEntries({ account, type, from, to }, 50);
  useEffect(() => { if (open) load(false); }, [open, type, account, from, to, version.value]);
  return (
    <Sheet open={open} onClose={onClose} title="All activity">
      <Segmented label="Show" value={type} onChange={setType} options={TYPE_FILTERS} />
      <Group>
        <PickerRow label="Account" value={account} placeholder="All accounts" options={everyday().map(a => ({ value: a.id, label: a.name }))} onChange={setAccount} />
        <InputRow label="From" type="date" value={from} onInput={setFrom} />
        <InputRow label="To" type="date" value={to} onInput={setTo} />
      </Group>
      <EntryList entries={items} onOpen={e => { onClose(); onOpen(e); }} empty="Nothing matches." />
      {more && <Block><Button large tonal onClick={() => load(true)}>Load more</Button></Block>}
    </Sheet>
  );
}
