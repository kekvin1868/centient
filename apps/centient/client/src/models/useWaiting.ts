// The waiting overlay for the screens: models/waiting's views over the outbox, plus the helpers that lay them on
// top of the server's data (entry lists, balances, budgets). The builder (and the server rule code it pulls in)
// is downloaded the first time something waits.
import { computed, effect, signal } from '@preact/signals-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { catalog } from '../lib/state';
import { accountQueries, type Balances } from './account';
import type { Budget, BudgetCycle } from './budget';
import type { EntryFilter, EntryItem } from './entry';
import { outboxItems } from './outbox';
import type { Overlay, WaitingEntry } from './waiting';

export const NOTHING: Overlay = {
  entries: [],
  removed: new Set(),
  accounts: {},
  envelopes: {},
  tabs: [],
  spending: [],
  count: 0,
  problems: 0,
};

const lib = signal<typeof import('./waiting') | null>(null);
let asked: Promise<typeof import('./waiting')> | null = null;
/**
 * The builder, downloaded once. The app asks for it while idle after it opens (App.tsx), so it is in memory, and
 * in the service worker's cache, before the signal is ever lost; a failed download is tried again next time.
 */
export const waitingLib = () =>
  (asked ??= import('./waiting').then(
    m => (lib.value = m),
    e => {
      asked = null;
      throw e;
    },
  ));
effect(() => {
  if (outboxItems.value.length) void waitingLib().catch(() => {});
});

/** What waits, as the screens show it. Reading `.value` in a component re-renders it when the outbox changes. */
export const waiting = computed<Overlay>(() =>
  lib.value && outboxItems.value.length
    ? lib.value.overlay(outboxItems.value, catalog.value)
    : NOTHING,
);

/** Checks an entry on the phone before it is queued; throws what the server would refuse it for. */
export async function checkEntry(command: Parameters<typeof import('./waiting').check>[0]) {
  if (!catalog.value.accounts.length) return; // nothing to check against yet
  // Without the builder (never downloaded, and no signal now) the entry is queued unchecked: the server checks.
  const m = await waitingLib().catch(() => null);
  m?.check(command, catalog.value, Date.now());
}

/** True when saving this edit of a bill would leave someone's Paid backs over their new share. */
export async function leavesPaybacksOver(
  bill: Parameters<typeof import('./waiting').leavesPaybacksOver>[0],
  command: Parameters<typeof import('./waiting').check>[0],
) {
  const m = await waitingLib().catch(() => null);
  return m ? m.leavesPaybacksOver(bill, command, catalog.value, Date.now()) : false;
}

export type ListedEntry = Omit<EntryItem, 'people'> & {
  people?: EntryItem['people'];
  waiting?: WaitingEntry['waiting'];
};

const matches = (e: ListedEntry, f: EntryFilter) => {
  const day = e.occurred_at.slice(0, 10);
  return (
    (!f.account || e.transactions.some(t => t.entries.some(l => l.account_id === f.account))) &&
    (!f.type || e.transactions.some(t => t.type === f.type)) &&
    (!f.from || day >= f.from) &&
    (!f.to || day <= f.to)
  );
};

/**
 * A page of the server's entries with the waiting ones laid over it: new ones added in date order, edited ones
 * shown as edited, deleted ones gone. A new entry the server's page already holds is the server's row.
 */
export function mergeEntries(items: ListedEntry[], o: Overlay, f: EntryFilter): ListedEntry[] {
  if (o === NOTHING) return items;
  const edits = new Map(o.entries.filter(e => e.waiting.op !== 'create').map(e => [e.id, e]));
  const have = new Set(items.map(e => e.id));
  const kept: ListedEntry[] = items
    .filter(e => !o.removed.has(e.id))
    .map(e => edits.get(e.id) ?? e);
  const added = o.entries.filter(
    e => e.waiting.op === 'create' && !have.has(e.id) && matches(e, f),
  );
  if (!added.length) return kept;
  // Stable: the server's order is kept, ours slot in by time (newest first).
  return [...added, ...kept].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** Balances with waiting changes counted, and a stand-in tab for each named person the server has not met. */
export function withWaiting(bal: Balances, o: Overlay): Balances {
  if (o === NOTHING) return bal;
  const like = bal.accounts.find(a => a.kind === 'IOU') ?? bal.accounts[0];
  return {
    accounts: [
      ...bal.accounts.map(a => ({ ...a, balance: a.balance + (o.accounts[a.id] ?? 0) })),
      ...(like
        ? o.tabs.map(t => ({
            ...like,
            id: t.id,
            name: t.name,
            kind: 'IOU',
            currency_code: t.currency,
            kept_until: null,
            balance: t.balance,
          }))
        : []),
    ],
    envelopes: bal.envelopes.map(e => ({ ...e, balance: e.balance + (o.envelopes[e.id] ?? 0) })),
  };
}

/**
 * What waiting Paid backs do to a person's bills: `paid` = what they already put on each bill, `changing` = bills
 * with a change of their own still waiting. `except`: the Paid back being edited.
 */
export function waitingLinks(except?: string) {
  const paid = new Map<string, number>();
  const changing = new Set<string>();
  for (const i of outboxItems.value) {
    if (i.state === 'sent' || i.state === 'refused' || i.state === 'clash') continue;
    const c = i.command;
    if (c?.type === 'TRANSFER' && c.bills && i.entryId !== except && i.op !== 'remove') {
      // An edited Paid back: only what it adds over what the server already counts.
      const before = i.saved?.command?.type === 'TRANSFER' ? (i.saved.command.bills ?? []) : [];
      for (const b of c.bills) paid.set(b.entryId, (paid.get(b.entryId) ?? 0) + b.amount);
      for (const b of before) paid.set(b.entryId, (paid.get(b.entryId) ?? 0) - b.amount);
    } else if (c?.type === 'EXPENSE' || i.op === 'remove') changing.add(i.entryId);
  }
  return { paid, changing };
}

/**
 * The overlay for server data fetched at `fetchedAt` (a query's dataUpdatedAt): a change the server took before
 * then is already in that data, so it is left out. Without this a just-sent entry counts twice, in the refreshed
 * numbers and in the overlay, until every screen's data is back (the total jumps over, then back).
 * ponytail: a fetch already on its way when the save landed may not hold it yet; the next refetch evens it out.
 */
export function useOverlaySince(fetchedAt: number): Overlay {
  const items = outboxItems.value;
  const all = waiting.value;
  const l = lib.value;
  const cat = catalog.value;
  return useMemo(() => {
    const rest = items.filter(i => !(i.sentAt && i.sentAt <= fetchedAt));
    if (rest.length === items.length) return all;
    return l && rest.length ? l.overlay(rest, cat) : NOTHING;
  }, [items, all, l, cat, fetchedAt]);
}

/** Balances as the screens show them (waiting changes counted). */
export function useBalances(enabled = true) {
  const q = useQuery({ ...accountQueries.balances(), enabled });
  const o = useOverlaySince(q.dataUpdatedAt);
  const data = useMemo(() => q.data && withWaiting(q.data, o), [q.data, o]);
  return { ...q, data };
}

/** Budgets with waiting spending counted: what was spent, what is left and the percent move; the forecast waits. */
export function budgetsWithWaiting(budgets: Budget[], cycle: BudgetCycle, o: Overlay): Budget[] {
  if (!o.spending.length) return budgets;
  const currencyOf = new Map(catalog.value.envelopes.map(e => [e.id, e.currency_code]));
  return budgets.map(b => {
    const from = b.startsOn ?? cycle.from;
    const to = b.endsOn ?? cycle.to; // excluded
    const more = o.spending
      .filter(
        s =>
          (!b.categoryId || s.categoryId === b.categoryId) &&
          (!b.envelopeId || s.envelopeId === b.envelopeId) &&
          currencyOf.get(s.envelopeId) === b.currency &&
          s.day >= from &&
          s.day < to,
      )
      .reduce((sum, s) => sum + s.amount, 0);
    if (!more) return b;
    const spent = b.spent + more;
    const remaining = b.limit - spent;
    // Days left, today counted (as the server: daysGone = today - from + 1).
    const left = b.daysGone === null ? 0 : b.cycleDays - b.daysGone + 1;
    return {
      ...b,
      spent,
      remaining,
      percent: b.limit ? Math.round((spent / b.limit) * 100) : 0,
      safePerDay: left > 0 ? Math.max(0, Math.floor(remaining / left)) : b.safePerDay,
    };
  });
}
