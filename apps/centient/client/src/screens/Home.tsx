// Home: what you can still spend (the HUD), a log box that turns what you type into cards, and recent activity.
// Logging has no Add button: press Enter / Done to log every ready card, or flick one card up to log just it.
import { parseQuickAdd } from '@centient/quickadd';
import { ArrowFatUp, CaretDown, Cards, KeyReturn, PencilSimple, Question, WifiSlash } from '@phosphor-icons/react';
import { Block, Button, List } from 'konsta/react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { call, client, OfflineError } from '../api';
import { AccountHand } from '../components/AccountHand';
import { AmountField } from '../components/AmountField';
import { Banner } from '../components/Banner';
import { BigMoney } from '../components/BigMoney';
import { Chip } from '../components/Chip';
import { EntryForm } from '../components/EntryForm';
import { EntryList, type Entry } from '../components/EntryList';
import { EntrySheet } from '../components/EntrySheet';
import { InputRow, PickerRow } from '../components/Fields';
import { dueSoon, usePlans } from '../components/Installments';
import { Logo } from '../components/Logo';
import { Group } from '../components/List';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { ACCOUNT_KINDS, dayLabel, formatMoney } from '../lib/format';
import { blankForm, chipView, fromDraft, toCommand, type Form, type LogItem } from '../lib/form';
import { categoryEmoji, titleCase } from '../lib/labels';
import { buzz, reducedMotion } from '../lib/motion';
import { attempt } from '../lib/run';
import { active, catalog, everyday, me, nameOf, offline, qctx, refresh, selectedAccount, version } from '../state';

export function Home({ onGoMoney }: { onGoMoney: () => void }) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  return (
    <main className="screen">
      <div className="flex items-center justify-between gap-3 px-4 pt-1">
        <h1><Logo height={30} className="text-ink" /></h1>
        <AccountChip onOpen={() => setPicking(true)} />
      </div>
      <Headline onGoMoney={onGoMoney} />
      <DueSoon onGo={onGoMoney} />
      <LogBox />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AccountPicker open={picking} onClose={() => setPicking(false)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet key={`entry:${open?.id ?? 'none'}`} entry={open} onClose={() => setOpen(null)} />
    </main>
  );
}

/** Which account Home shows. Opens the hand of account cards. */
function AccountChip({ onOpen }: { onOpen: () => void }) {
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

/** Pick the account Home shows from a dealt hand; the joker is "all accounts". */
function AccountPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
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

/** Installments due within 3 days (or overdue), one line each; tap to open Money. */
function DueSoon({ onGo }: { onGo: () => void }) {
  const plans = usePlans();
  const today = me.value?.today ?? '';
  const due = plans ? dueSoon(plans, today) : [];
  if (!due.length) return null;
  const accounts = catalog.value.accounts;
  return (
    <section className="mx-4 -mt-2 mb-5 flex flex-col gap-2" aria-label="Installments due soon">
      {due.slice(0, 3).map(p => {
        const acc = accounts.find(a => a.id === p.accountId);
        const overdue = p.next!.due < today;
        return (
          <button key={p.id} type="button" onClick={onGo}
            className={`panel flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:opacity-80 ${overdue ? 'bg-pink text-white' : 'bg-white dark:bg-raised'}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{acc?.name} · {p.name}</span>
              <span className={`block text-[13px] ${overdue ? '' : 'text-muted'}`}>{overdue ? 'Overdue since' : 'Due'} {dayLabel(p.next!.due, today)} · installment {p.next!.no} of {p.installments}</span>
            </span>
            <span className="num shrink-0 text-[16px] font-extrabold">{formatMoney(p.next!.left, acc?.currency_code)}</span>
          </button>
        );
      })}
    </section>
  );
}

type Head = { label: string; minor: number; currency: string; note: string; tag?: string; hurt: boolean; cta: string };
// Last data shown, per account, so coming back to Home shows it at once instead of rebuilding the screen.
const headCache = new Map<string, Head>();
const recentCache = new Map<string, { items: Entry[]; cursor: string | null }>();

/** The HUD: answers "how much can I still spend?". Teal when fine, pink when it's below zero. */
function Headline({ onGoMoney }: { onGoMoney: () => void }) {
  const key = selectedAccount.value ?? 'all';
  const [head, setHead0] = useState<Head | null>(headCache.get(key) ?? null);
  const setHead = (h: Head) => { headCache.set(key, h); setHead0(h); };
  useEffect(() => {
    attempt(async () => {
      const sel = selectedAccount.value;
      const bal = await call(client.api.balances.$get());
      if (sel) {
        const a = bal.accounts.find(x => x.id === sel);
        if (a) return setHead({ label: `In ${a.name}`, minor: a.balance, currency: a.currency_code, note: ACCOUNT_KINDS[a.kind] ?? '', hurt: false, cta: 'Update balance' });
      }
      const b = await call(client.api.budgets.$get({ query: {} }));
      const startDay = me.value?.workspace.cycle_start_day ?? 1;
      if (b.budgets.length) {
        const left = b.budgets.reduce((s, x) => s + Math.max(0, x.remaining), 0);
        const perDay = b.budgets.reduce((s, x) => s + (x.safePerDay ?? 0), 0);
        const d = b.cycle.daysLeft;
        return setHead({
          label: left > 0 ? (startDay === 1 ? 'Left this month' : `Left until ${b.cycle.to}`) : 'Budget spent',
          minor: left, currency: 'IDR', note: left > 0 ? `About ${formatMoney(perDay)} a day` : 'Every budget is used up for this month',
          tag: `${d} day${d === 1 ? '' : 's'} left`, hurt: left <= 0, cta: 'Budgets',
        });
      }
      // No budget yet: what's free to spend is the money in the Main pockets of everyday accounts (rupiah).
      // Money moved into other pockets is set aside, so it doesn't count.
      const mains = new Set(everyday().filter(x => !['CREDIT_CARD', 'PAYLATER', 'EXCHANGE'].includes(x.kind) && x.currency_code === 'IDR').map(x => x.default_envelope_id));
      const free = bal.envelopes.filter(e => mains.has(e.id)).reduce((t, e) => t + e.balance, 0);
      const over = free < 0;
      setHead({
        label: over ? 'Overspent' : 'Free to spend', minor: free, currency: 'IDR',
        note: over ? 'Your accounts\' Main pockets are below zero.' : 'Money in your accounts\' Main pockets. A budget shows a daily amount.',
        hurt: over, cta: 'Set a budget',
      });
    });
  }, [version.value, selectedAccount.value]);

  const card = `panel halftone relative mx-4 mt-4 mb-5 rounded-[24px] px-5 pt-4 pb-5 transition-colors duration-500 ${head?.hurt ? 'bg-pink text-white' : 'bg-miku text-[#0b0f0f]'}`;
  if (!head) return <div className={`${card} min-h-48`} />;
  return (
    <section className={card} aria-label="What you can spend">
      <div className="relative flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-bold leading-none">{head.label}</h2>
        {head.tag && <span className="shrink-0 rotate-3 rounded-md bg-[#0b0f0f] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-miku">{head.tag}</span>}
      </div>
      <BigMoney minor={head.minor} currency={head.currency} max={68} inset={76} className="relative mt-4" />
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <p className={`text-[15px] font-medium leading-snug ${head.hurt ? '' : 'opacity-80'}`}>{head.note}</p>
        <button type="button" onClick={onGoMoney}
          className="shrink-0 rounded-full bg-[#0b0f0f] px-3.5 py-2 text-[15px] font-bold text-white active:opacity-80">
          {head.cta} ▸
        </button>
      </div>
    </section>
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
  const ready = items.filter(i => chipView(i).state === 'ready');

  const update = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.map(p => (p.key === item.key ? item : p)));
    else setEdits({ ...edits, [item.key]: item });
  };
  const remove = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.filter(p => p.key !== item.key));
    else setText(live.filter(i => i.key !== item.key).map(i => i.text).join(', '));
  };

  const submit = async () => {
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
    buzz(20);
    // Cards still waiting for an answer stay, detached from the cleared box.
    setPending(items.filter(i => chipView(i).state !== 'ready').map((i, n) => ({ ...i, key: `p${Date.now()}-${n}` })));
    setText('');
    setEdits({});
    showToast(ready.length === 1 ? 'Logged' : `Logged ${ready.length} entries`);
    await refresh();
  };

  // Offline: keep everything, try again as soon as the connection is back.
  useEffect(() => {
    const retry = () => { if (offline.value) submit(); };
    addEventListener('online', retry);
    return () => removeEventListener('online', retry);
  });

  /** Logs one card (flicked up, or saved from its sheet). */
  const logOne = async (item: LogItem) => {
    const r = toCommand(item.form);
    if ('error' in r) return false;
    const ok = await attempt(() => call(client.api.quickadd.save.$post({
      json: { items: [{ command: r.command, rawMerchant: item.rawMerchant || undefined, suggestedMerchant: item.rawMerchant ? item.suggestedMerchant : undefined }] },
    })));
    if (!ok) return false;
    buzz(20);
    setSheet(null);
    remove(item);
    showToast('Logged');
    await refresh();
    return true;
  };
  const manual = () => setSheet({
    key: `m${Date.now()}`, text: '', form: { ...blankForm(today), accountId: selectedAccount.value ?? qctx.value?.lastAccountId ?? null },
    candidates: [], askAmount: false, askCharged: false, rawMerchant: '', suggestedMerchant: '',
  });

  // The key on the right says what Enter will do: log (cyan, with a count), answer a card first (?), or,
  // with nothing typed, open the full form.
  const key = ready.length
    ? <button type="submit" className="keycap gap-1 [animation:nudge_1.4s_ease-in-out_infinite]" disabled={saving} aria-label={`Log ${ready.length} entr${ready.length === 1 ? 'y' : 'ies'}`}>
        <span className="flex items-center gap-1"><KeyReturn size={18} weight="bold" aria-hidden="true" />{ready.length > 1 && `×${ready.length}`}</span>
      </button>
    : items.length
      ? <button type="submit" className="keycap keycap-quiet" aria-label="Answer the card first"><Question size={18} weight="bold" aria-hidden="true" /></button>
      : <button type="button" className="keycap keycap-quiet" onClick={manual} aria-label="Add without typing"><PencilSimple size={18} weight="bold" aria-hidden="true" /></button>;

  return (
    <section>
      {offline.value && <Banner><WifiSlash size={18} aria-hidden="true" /> No connection, your entry is still here.</Banner>}
      <form className="panel mx-4 flex items-center gap-2 rounded-[18px] bg-white py-1.5 pl-4 pr-1.5 dark:bg-raised" onSubmit={e => { e.preventDefault(); submit(); }}>
        <span className="text-[16px] text-primary" aria-hidden="true">▶</span>
        <input className="min-w-0 flex-1 bg-transparent py-2 text-[17px] font-medium outline-none placeholder:text-muted" value={text}
          placeholder="What did you spend?" aria-label="What did you spend or receive?" aria-describedby="log-hint" autoComplete="off"
          enterKeyHint="done" onChange={e => setText((e.target as HTMLInputElement).value)} />
        {key}
      </form>
      <p id="log-hint" className="mx-5 mt-2.5 text-[13px] text-muted">
        {ready.length ? 'Enter logs every ready card · flick one up to log just it'
          : items.length ? 'Answer the card below, then press Enter'
          : 'Type it like a text: kopi 25rb gopay, grab 18k'}
      </p>
      <div className="mx-4 mt-3">
        {items.map(i => <LogChip key={i.key} item={i} today={today} onChange={update} onOpen={() => setSheet(i)} onLog={() => logOne(i)} />)}
      </div>
      <LogSheet key={sheet?.key ?? 'none'} item={sheet} onClose={() => setSheet(null)} onSave={logOne} />
    </section>
  );
}

function LogChip({ item, today, onChange, onOpen, onLog }: { item: LogItem; today: string; onChange: (i: LogItem) => void; onOpen: () => void; onLog: () => Promise<boolean> }) {
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

  // Flick a ready card up to log it: past 70px (or a quick flick) it flies off; otherwise it springs back.
  const y = useMotionValue(0);
  const opacity = useTransform(y, [-160, 0], [0, 1]);
  const dragged = useRef(false);
  const ready = v.state === 'ready';
  const fling = async () => {
    const off = reducedMotion() ? { duration: 0 } : { duration: 0.22 };
    await animate(y, -260, off);
    if (!(await onLog())) animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
  };

  return (
    <motion.div style={{ y, opacity }} drag={ready ? 'y' : false} dragConstraints={{ bottom: 0 }} dragElastic={{ bottom: 0.05 }} dragMomentum={false}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={(_, info) => {
        setTimeout(() => { dragged.current = false; });
        if (info.offset.y < -70 || info.velocity.y < -500) fling();
        else animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
      }}>
      <Chip state={v.state} emoji={categoryEmoji(category, f.type)} title={title} sub={sub}
        amount={f.amount ? formatMoney(f.amount, currency) : undefined} question={v.state === 'ask' ? v.question : undefined}
        onOpen={() => { if (!dragged.current) onOpen(); }}
        hint={ready ? <span className="flex items-center gap-1 [animation:nudge_1.4s_ease-in-out_infinite]"><ArrowFatUp size={12} weight="fill" aria-hidden="true" />Flick</span> : undefined}>
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
    </motion.div>
  );
}

function LogSheet({ item, onClose, onSave }: { item: LogItem | null; onClose: () => void; onSave: (i: LogItem) => unknown }) {
  const [form, setForm] = useState<Form | null>(item?.form ?? null);
  if (!item || !form) return null;
  const r = toCommand(form);
  return (
    <Sheet open onClose={onClose} title={item.text ? 'Check entry' : 'New entry'}>
      <EntryForm form={form} onChange={setForm} />
      <Block>
        <Button large rounded disabled={'error' in r} onClick={() => onSave({ ...item, askAmount: false, askCharged: false, form })}>
          {'error' in r ? r.error : 'Log it'}
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
      {more && <Block><Button large rounded tonal onClick={onSeeAll}>See all</Button></Block>}
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
      {more && <Block><Button large rounded tonal onClick={() => load(true)}>Load more</Button></Block>}
    </Sheet>
  );
}
