// A person's tab: record what they paid back (or what you returned to them). Into / from one of your accounts in the
// tab's currency. Paying more than the tab owes asks what the extra is. With `entry` it edits that Paid back.
// A Paid back pays the person's split bills: with one open bill it goes there; with two or more, Save opens the
// divide step (one HP bar per bill, filled oldest first, drag or type each one; a pool shows what is left).
import { useQuery } from '@tanstack/react-query';
import { Block, BlockFooter, Button } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { titleCase } from '../../lib/labels';
import { active, catalog, everyday, me } from '../../lib/state';
import { accountApi, accountQueries } from '../../models/account';
import {
  billQueries,
  billSource,
  canSave,
  fillOldestFirst,
  linksOf,
  openBars,
  poolOf,
  setBar,
  type Bar,
} from '../../models/bills';
import { entryApi } from '../../models/entry';
import { extraOf, moveCommand, type PayMode } from '../../models/payback';
import { persist } from '../../models/query';
import { AmountField } from '../../ui/AmountField';
import { dateText, DateRow, PickerRow } from '../../ui/Fields';
import { HpBar } from '../../ui/HpBar';
import { KeyChip } from '../../ui/KeyChip';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { useSumInput } from '../../ui/useSumInput';
import type { Entry } from './EntryList';
import { PocketStamps } from './PocketStamps';

export function PaidBackSheet({
  tabId,
  mode,
  entry,
  onClose,
}: {
  tabId: string;
  mode: PayMode;
  /** The saved payback being edited. */
  entry?: Entry;
  onClose: () => void;
}) {
  const { data } = useQuery(accountQueries.balances());
  const { data: bills } = useQuery({
    ...billQueries.ofTab(tabId, entry?.id),
    enabled: mode === 'PAID',
  });
  const saved = entry?.command?.type === 'TRANSFER' ? entry.command : null;
  const tab = data?.accounts.find(a => a.id === tabId);
  // What the tab stands at without this payback.
  const owed = (tab?.balance ?? 0) + (saved?.amount ?? 0) - (saved?.gift ?? 0);
  const full = mode === 'PAID' ? Math.max(0, owed) : Math.max(0, -owed);
  const [amount, setAmount] = useState<number | null | undefined>(saved?.amount); // undefined = not touched
  const [accountId, setAccountId] = useState<string | null>(saved?.toAccountId ?? null);
  // undefined = not picked yet: a new Paid back starts on the bill's pocket.
  const [picked, setPocket] = useState<string | null | undefined>(
    saved ? (saved.toEnvelopeId ?? null) : undefined,
  );
  const [date, setDate] = useState(saved?.date ?? me.value?.today ?? '');
  const [gift, setGift] = useState<'OWE' | 'GIFT'>(saved?.gift ? 'GIFT' : 'OWE');
  /** Set once Save opens the divide step. */
  const [bars, setBars] = useState<Bar[] | null>(null);
  if (!data || !tab || (mode === 'PAID' && !bills)) return null;

  const shown = amount === undefined ? full : amount; // opens on the whole tab
  const accounts = everyday().filter(a => a.currency_code === tab.currency_code);
  // A new Paid back starts where the bill was paid from (oldest one still owed), so the money goes back there.
  const from = saved || mode !== 'PAID' ? null : billSource(bills ?? []);
  const account =
    accounts.find(a => a.id === accountId) ??
    (saved ? undefined : (accounts.find(a => a.id === from?.accountId) ?? accounts[0]));
  const pocket =
    picked !== undefined
      ? picked
      : account?.id === from?.accountId
        ? (from?.envelopeId ?? null)
        : null;
  const pockets = active(catalog.value.envelopes).filter(e => e.account_id === account?.id);
  const cur = tab.currency_code;
  const extra = mode === 'PAID' ? extraOf(shown, owed) : 0;
  const tooMuch = mode === 'RETURN' && (shown ?? 0) > full;
  const category = catalog.value.categories.find(c => c.name === 'Other income');
  const ok = Boolean(shown && account && date && !tooMuch);
  const giftAmount = gift === 'GIFT' && extra > 0 && category ? extra : 0;
  const open = openBars(bills ?? []);

  const commit = async (links: { entryId: string; amount: number }[]) => {
    if (!shown || !account) return;
    const move = moveCommand(mode, {
      tabId: tab.id,
      accountId: account.id,
      pocket,
      amount: shown,
      date,
      gift: giftAmount,
      bills: links,
    });
    const done = await persist(() =>
      entry ? entryApi.edit(entry.id, move) : entryApi.record(move),
    );
    if (!done) return;
    // Everything you owed is back: the Kept day is done with.
    if (mode === 'RETURN' && shown >= full && tab.kept_until)
      await persist(() => accountApi.update(tab.id, { kept_until: null }));
    onClose();
    showToast(entry ? 'Saved' : 'Logged');
  };

  const save = () => {
    if (mode === 'RETURN' || !shown) return commit([]);
    // Two or more open bills: you say how it divides (oldest first to start, or as saved when editing).
    if (open.length >= 2) {
      const before = new Map(saved?.bills?.map(b => [b.entryId, b.amount]));
      setBars(
        saved?.bills?.length
          ? open.map(b => ({ ...b, amount: Math.min(b.left, before.get(b.id) ?? 0) }))
          : fillOldestFirst(open, shown),
      );
      return;
    }
    return commit(linksOf(fillOldestFirst(open, shown), shown - giftAmount));
  };

  const extraChoice = extra > 0 && (
    <>
      <BlockFooter inset>{formatMoney(extra, cur)} extra</BlockFooter>
      <Segmented
        label="What the extra is"
        value={gift}
        onChange={setGift}
        options={[
          { value: 'OWE', label: `I owe ${tab.name}` },
          { value: 'GIFT', label: "It's a gift" },
        ]}
      />
    </>
  );

  if (bars && shown) {
    const pool = poolOf(bars, shown);
    const ready = canSave(bars, shown);
    return (
      <Sheet open onClose={onClose} title={`Divide ${formatMoney(shown, cur)}`}>
        <div className="mx-4 mb-3 mt-1 flex items-baseline justify-between" aria-live="polite">
          <span className="text-[15px] text-muted">From {tab.name}</span>
          <span className="num text-[15px]">
            Pool <b className={pool > 0 ? 'text-negative' : ''}>{formatMoney(pool, cur)}</b> left of{' '}
            {formatMoney(shown, cur)}
          </span>
        </div>
        <ul className="mx-4 mb-4 flex flex-col gap-3">
          {bars.map(b => (
            <BarRow
              key={b.id}
              bar={b}
              currency={cur}
              onChange={v => setBars(setBar(bars, b.id, v, shown))}
            />
          ))}
        </ul>
        {pool > 0 && ready && extraChoice}
        {!ready && (
          <BlockFooter inset>
            Place the last {formatMoney(pool, cur)} on a bill to save.
          </BlockFooter>
        )}
        <Block className="flex gap-3">
          <Button large rounded tonal className="flex-1" onClick={() => setBars(null)}>
            Back
          </Button>
          <Button
            large
            rounded
            className="flex-1"
            disabled={!ready}
            onClick={() => commit(linksOf(bars, shown - giftAmount))}
          >
            Save
          </Button>
        </Block>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={mode === 'PAID' ? 'Paid back' : 'Return money'}>
      <Group>
        <AmountField
          label={mode === 'PAID' ? `${tab.name} paid` : `Back to ${tab.name}`}
          currency={cur}
          value={shown}
          onChange={setAmount}
          autoFocus
        />
        <PickerRow
          label={mode === 'PAID' ? 'Into' : 'From'}
          value={account?.id ?? null}
          options={accounts.map(a => ({ value: a.id, label: a.name }))}
          onChange={v => {
            setAccountId(v);
            setPocket(null);
          }}
        />
        <DateRow label="Date" value={date} onChange={setDate} />
      </Group>
      {pockets.length > 1 && (
        <div className="mx-4 mb-4">
          <PocketStamps
            label="Pocket"
            pockets={pockets}
            mainId={account?.default_envelope_id ?? null}
            value={pocket}
            onChange={setPocket}
          />
        </div>
      )}
      {open.length < 2 && extraChoice}
      {tooMuch && <BlockFooter inset>You only owe {formatMoney(full, cur)}.</BlockFooter>}
      <Block>
        <Button large rounded disabled={!ok} onClick={save}>
          {mode === 'PAID' && open.length >= 2 ? `Next: divide over ${open.length} bills` : 'Save'}
        </Button>
      </Block>
    </Sheet>
  );
}

/** One bill in the divide step: name and date, a big draggable HP bar, and the amount to type exactly. */
function BarRow({
  bar: b,
  currency,
  onChange,
}: {
  bar: Bar;
  currency: string;
  onChange: (v: number) => void;
}) {
  const { input, below } = useSumInput(b.amount, currency, m => onChange(m ?? 0));
  const full = b.amount === b.left;
  const name = titleCase(b.title);
  return (
    <li className="panel rounded-2xl bg-raised px-3.5 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[16px] font-bold">{name}</span>
        <span className="text-[13px] text-muted">{dateText(b.date)}</span>
        {full && <KeyChip state="PAID" />}
      </div>
      <HpBar value={b.amount} max={b.left} onChange={onChange} label={name} size="big" />
      <div className="mt-2 flex items-baseline gap-1 text-[15px]">
        <input
          className="num w-28 rounded-md border border-edge bg-raised-2 px-2 py-1 font-bold outline-none"
          aria-label={`Amount for ${name}`}
          {...input}
        />
        <span className="num text-muted">/ {formatMoney(b.left, currency)}</span>
      </div>
      {below}
    </li>
  );
}
