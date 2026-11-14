// What waiting changes (models/outbox) look like before the server has them: the rows to show, what they do to
// balances and budgets, and the people who have no tab yet. Pure: outbox items + the catalog in, views out.
// The lines are built by the server's own rule code (src/lib/entryBuild), so the phone's maths is the server's.
// Loaded on first use (models/useWaiting), to keep it out of the first download.
import { build, checkParties } from '../../../src/lib/entryBuild';
import { snapshotOf } from '../../../src/lib/catalog';
import type { Command } from '../../../src/lib/schemas';
import { assertBalanced, type NewTransaction } from '../../../src/domain/ledger';
import { cutsFor, peopleOf, tabsOnBill, type Link } from '../../../src/domain/bills';
import type { EntryItem } from './entry';
import type { OutboxItem, OutboxState, SavedEntry } from './outbox';
import type { Catalog } from './workspace';

/** How a waiting row is marked. */
export type WaitingMark = {
  state: OutboxState;
  held: boolean;
  reason?: string;
  op: OutboxItem['op'];
};
export type WaitingEntry = SavedEntry & { waiting: WaitingMark };
/** A person named on a waiting split bill who has no tab on the server yet. */
export type StandIn = { id: string; name: string; currency: string; balance: number };
/** Waiting spending, for budgets: positive = more spent. `day` is YYYY-MM-DD. */
export type Spending = {
  categoryId: string | null;
  envelopeId: string;
  amount: number;
  day: string;
};
export type Overlay = {
  /** New entries and edited ones, as full entry rows; newest first. */
  entries: WaitingEntry[];
  /** Entries a waiting delete hides. */
  removed: Set<string>;
  /** What waiting changes add to each account's and each pocket's balance. */
  accounts: Record<string, number>;
  envelopes: Record<string, number>;
  tabs: StandIn[];
  spending: Spending[];
  /** Changes on their way (not counting the ones that need the owner). */
  count: number;
  /** Refused or clashed: they wait for the owner. */
  problems: number;
};

export const STAND_IN = 'waiting:';
type Row = Catalog['accounts'][number];
type Lines = {
  accounts: Record<string, number>;
  envelopes: Record<string, number>;
  spending: Spending[];
};
const none = (): Lines => ({ accounts: {}, envelopes: {}, spending: [] });
const add = (into: Record<string, number>, id: string, amount: number) => {
  into[id] = (into[id] ?? 0) + amount;
};

/**
 * Gives every named person a tab id the builder can use: their tab when the phone knows one (by name, in the bill's
 * currency), else a stand-in. The command that is *sent* keeps the names; the server finds or makes the real tabs.
 */
function withTabs(cmd: Command, accounts: Row[], standIns: Map<string, Row>): Command {
  if (cmd.type !== 'EXPENSE' || !cmd.split) return cmd;
  const currency = accounts.find(a => a.id === cmd.accountId)?.currency_code ?? 'IDR';
  const tab = (name: string) => {
    const key = name.trim().toLowerCase();
    const known = accounts.find(
      a => a.kind === 'IOU' && a.currency_code === currency && a.name.trim().toLowerCase() === key,
    );
    if (known) return known.id;
    // The first spelling typed names the stand-in (and is its id), whatever case the next one uses.
    const made = [...standIns.values()].find(
      t => t.currency_code === currency && t.name.toLowerCase() === key,
    );
    if (made) return made.id;
    const id = `${STAND_IN}${currency}:${name.trim()}`;
    standIns.set(id, {
      ...accounts[0],
      id,
      name: name.trim(),
      kind: 'IOU',
      currency_code: currency,
      default_envelope_id: `${id}:main`,
      archived_at: null,
    });
    return id;
  };
  const parties = cmd.split.parties?.map(p => ({
    ...p,
    iouAccountId: p.iouAccountId ?? (p.name ? tab(p.name) : undefined),
  }));
  const lump = !cmd.split.iouAccountId && (!parties || parties.some(p => !p.iouAccountId));
  return {
    ...cmd,
    split: { ...cmd.split, parties, iouAccountId: lump ? tab('Friends') : cmd.split.iouAccountId },
  };
}

function snapshot(cat: Catalog, standIns: Map<string, Row>) {
  const tabs = [...standIns.values()];
  const pockets = tabs.map(t => ({
    ...cat.envelopes[0],
    id: `${t.id}:main`,
    account_id: t.id,
    name: 'Main',
    kind: 'SPENDING',
    currency_code: t.currency_code,
    archived_at: null,
  }));
  return snapshotOf(
    [...cat.accounts, ...tabs] as Parameters<typeof snapshotOf>[0],
    [...cat.envelopes, ...pockets] as Parameters<typeof snapshotOf>[1],
    cat.categories as Parameters<typeof snapshotOf>[2],
  );
}

/** Builds a command's transactions on the phone; throws the same refusals the server would (DomainError). */
function transactions(cmd: Command, cat: Catalog, now: number, standIns = new Map<string, Row>()) {
  if (cmd.type === 'EXPENSE' && cmd.split?.parties) checkParties(cmd.amount, cmd.split);
  const ready = withTabs(cmd, cat.accounts, standIns);
  const snap = snapshot(cat, standIns);
  const txs = build(snap, ready, now);
  for (const t of txs) assertBalanced(t, id => snap.accountOf(id));
  return txs;
}

/** Checks an entry before it is queued: what the phone can tell now is said now, not after a failed send. */
export function check(cmd: Command, cat: Catalog, now: number): void {
  transactions(cmd, cat, now);
}

/** A tab: a person's IOU account, or a stand-in for one the server has not made yet. */
const tabTest = (cat: Catalog) => (id: string) =>
  id.startsWith(STAND_IN) || cat.accounts.some(a => a.id === id && a.kind === 'IOU');

/** A bill's Paid backs, as the links the bill rules (domain/bills) work with. */
const linksOf = (billId: string, people: EntryItem['people'] | undefined): Link[] =>
  (people ?? []).flatMap(p =>
    p.paybacks.map(b => ({
      payback: b.entryId,
      bill: billId,
      tab: p.tabId,
      amount: b.amount,
      date: b.date,
    })),
  );

/** True when a bill's new shares leave a Paid back over someone's share: the owner is asked what happened to it. */
export function leavesPaybacksOver(
  bill: { id: string; people?: EntryItem['people'] },
  cmd: Command,
  cat: Catalog,
  now: number,
): boolean {
  const links = linksOf(bill.id, bill.people);
  if (!links.length) return false;
  return cutsFor(links, tabsOnBill(transactions(cmd, cat, now), tabTest(cat))).length > 0;
}

function linesOf(
  txs: {
    type: string;
    category_id: string | null;
    occurred_at: string;
    entries: { account_id: string; amount: number }[];
    allocations: { envelope_id: string; amount: number }[];
  }[],
): Lines {
  const out = none();
  for (const t of txs) {
    for (const e of t.entries) add(out.accounts, e.account_id, e.amount);
    for (const a of t.allocations) {
      add(out.envelopes, a.envelope_id, a.amount);
      if (t.type === 'EXPENSE')
        out.spending.push({
          categoryId: t.category_id,
          envelopeId: a.envelope_id,
          amount: -a.amount,
          day: t.occurred_at.slice(0, 10),
        });
    }
  }
  return out;
}

const viewOf = (entryId: string, txs: NewTransaction[]): EntryItem['transactions'] =>
  txs.map((t, n) => ({
    id: `${entryId}:${n}`,
    type: t.type,
    occurred_at: t.occurredAt,
    category_id: t.categoryId,
    merchant: t.merchant,
    note: t.note,
    original_amount: t.originalAmount ?? null,
    original_currency: t.originalCurrency ?? null,
    entries: t.entries.map(e => ({ account_id: e.accountId, amount: e.amount })),
    allocations: t.allocations.map(a => ({ envelope_id: a.envelopeId, amount: a.amount })),
  }));

/**
 * Everything the screens add on top of the server's data. A list drops our row for an entry the server's page
 * already holds (models/useWaiting `mergeEntries`).
 */
export function overlay(items: OutboxItem[], cat: Catalog): Overlay {
  const standIns = new Map<string, Row>();
  const out: Overlay = {
    entries: [],
    removed: new Set(),
    accounts: {},
    envelopes: {},
    tabs: [],
    spending: [],
    count: 0,
    problems: 0,
  };
  if (!cat.accounts.length) return out;
  const isTab = tabTest(cat);

  const byEntry = new Map<string, OutboxItem[]>();
  for (const i of items) byEntry.set(i.entryId, [...(byEntry.get(i.entryId) ?? []), i]);

  for (const [entryId, own] of byEntry) {
    const saved = own[0].saved;
    const before = saved ? linesOf(saved.transactions) : none();
    let counted = before; // what the numbers show: only changes expected to land
    let shown: WaitingEntry | null = null;
    let gone = false;
    for (const item of own) {
      const stuck = item.state === 'refused' || item.state === 'clash';
      if (stuck) out.problems++;
      else if (item.state !== 'sent') out.count++;
      const mark: WaitingMark = {
        state: item.state,
        held: Boolean(item.held),
        reason: item.reason,
        op: item.op,
      };
      if (item.op === 'remove') {
        // A refused delete leaves the entry where it was, marked.
        if (stuck && saved) shown = { ...saved, waiting: mark };
        else gone = true;
        if (!stuck) counted = none();
        continue;
      }
      let txs: NewTransaction[];
      try {
        txs = transactions(item.command!, cat, item.at, standIns);
      } catch {
        // The catalog moved under it (its pocket was hidden): the server will say why. No lines to show.
        if (saved) shown = { ...saved, waiting: mark };
        continue;
      }
      // An edit on the same day keeps the entry's time, as the server does.
      if (saved && item.command!.date === saved.occurred_at.slice(0, 10))
        for (const t of txs) t.occurredAt = saved.occurred_at;
      const view = viewOf(entryId, txs);
      const links = linksOf(entryId, saved?.people);
      const split = item.command!.type === 'EXPENSE' && item.command!.split;
      shown = {
        id: entryId,
        kind: 'USER',
        occurred_at: view[0].occurred_at,
        command: item.command!,
        icon: saved?.icon ?? null,
        version: saved?.version ?? 0,
        transactions: view,
        people: split ? peopleOf(entryId, txs, isTab, links) : null,
        waiting: mark,
      };
      gone = false;
      if (!stuck) counted = linesOf(view);
    }
    if (gone) out.removed.add(entryId);
    else if (shown) out.entries.push(shown);
    for (const [id, amount] of Object.entries(counted.accounts)) add(out.accounts, id, amount);
    for (const [id, amount] of Object.entries(before.accounts)) add(out.accounts, id, -amount);
    for (const [id, amount] of Object.entries(counted.envelopes)) add(out.envelopes, id, amount);
    for (const [id, amount] of Object.entries(before.envelopes)) add(out.envelopes, id, -amount);
    out.spending.push(
      ...counted.spending,
      ...before.spending.map(s => ({ ...s, amount: -s.amount })),
    );
  }
  out.entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  out.tabs = [...standIns.values()].map(t => ({
    id: t.id,
    name: t.name,
    currency: t.currency_code,
    balance: out.accounts[t.id] ?? 0,
  }));
  return out;
}
