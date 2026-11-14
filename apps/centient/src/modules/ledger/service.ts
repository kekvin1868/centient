// Ledger use cases: log, edit, delete and list what the user spent, earned and moved.
// Every referenced account, pocket and category is checked against this workspace's catalog.
import type { ServiceDeps } from '../../context';
import type { Snapshot } from '../../lib/catalog';
import type { Command } from '../../lib/schemas';
import { assertBalanced, DomainError, type NewTransaction } from '../../domain/ledger';
import { cutsFor, peopleOf, tabsOnBill, type Link } from '../../domain/bills';
import { build, checkParties } from '../../lib/entryBuild';
import { commandOf } from '../../lib/entryCommand';
import { advance, paidBy } from '../recurring/advance';
import { findOrCreateTab } from './tabs';
import type { EntryView, NewEntry, TxFilter } from '../../repos/entries';

export type LedgerService = ReturnType<typeof createLedgerService>;
/** What happens to Paid backs a deleted or shrunk bill no longer has room for (see `settle`). */
export type PaybackMode = 'NEVER_RECEIVED' | 'RETURN';
type Transfer = Extract<Command, { type: 'TRANSFER' }>;
const isTabOf = (c: Snapshot) => (id: string) =>
  c.accounts.some(a => a.id === id && a.kind === 'IOU');

export function createLedgerService({ ws, now, repos, catalog }: ServiceDeps) {
  /**
   * Gets a split bill's IOU accounts ready. Named people get their own tab (found by name in the bill's currency,
   * or made); a split with unnamed people, or an old one without `parties`, goes to a lump account: the one given,
   * else the "Friends" tab in the bill's currency (made if missing, refused while hidden; never a person's tab).
   * The saved command keeps ids only, so a rename follows.
   * ponytail: a "Friends" the owner renamed is not found; a new one is made. Look up name history if that bites.
   */
  async function withIou(c: Snapshot, cmds: Command[]): Promise<{ c: Snapshot; cmds: Command[] }> {
    // Every bill is checked before any tab is made, so a refused save leaves no new tabs behind.
    for (const x of cmds)
      if (x.type === 'EXPENSE' && x.split?.parties) checkParties(x.amount, x.split);
    const tab = async (name: string, currency: string) => {
      const id = await findOrCreateTab(repos, ws, c.accounts, name, currency);
      if (!c.accounts.some(a => a.id === id)) {
        catalog.invalidate();
        c = await catalog.load();
      }
      return id;
    };
    const out: Command[] = [];
    for (const x of cmds) {
      if (x.type !== 'EXPENSE' || !x.split) {
        out.push(x);
        continue;
      }
      const split = { ...x.split };
      const currency = c.account(x.accountId).row.currency_code;
      if (split.parties) {
        const resolved: NonNullable<typeof split.parties> = [];
        for (const p of split.parties) {
          const iouAccountId = p.iouAccountId ?? (p.name ? await tab(p.name, currency) : undefined);
          resolved.push({ iouAccountId, share: p.share, paid: p.paid, covered: p.covered });
        }
        // A typed name can still land on a tab given by id elsewhere on the bill.
        const ids = resolved.flatMap(p => (p.iouAccountId ? [p.iouAccountId] : []));
        if (new Set(ids).size !== ids.length)
          throw new DomainError('DUPLICATE_PARTY', 'Each person once');
        split.parties = resolved;
      }
      if (!split.iouAccountId && (!split.parties || split.parties.some(p => !p.iouAccountId)))
        split.iouAccountId = await tab('Friends', currency);
      out.push({ ...x, split });
    }
    return { c, cmds: out };
  }

  /**
   * Refuses lines in a pocket or account that is hidden: one hidden on another device while this entry waited on a
   * phone would otherwise take it out of sight. `keep`: ids the entry already uses (an old entry stays editable).
   * Person tabs are left to withIou (TAB_HIDDEN).
   */
  function checkShown(c: Snapshot, txs: NewTransaction[], keep = new Set<string>()) {
    for (const tx of txs) {
      for (const { envelopeId } of tx.allocations) {
        const e = c.envelopes.find(x => x.id === envelopeId);
        if (e?.archived_at && !keep.has(e.id))
          throw new DomainError(
            'POCKET_HIDDEN',
            `${e.name} is hidden. Show it again or pick another pocket.`,
          );
      }
      for (const { accountId } of tx.entries) {
        const a = c.accounts.find(x => x.id === accountId);
        if (a?.archived_at && a.kind !== 'IOU' && !keep.has(a.id))
          throw new DomainError(
            'ACCOUNT_HIDDEN',
            `${a.name} is hidden. Show it again or pick another account.`,
          );
      }
    }
  }

  /** Checks each command against the catalog and builds its entry (a split or a fee adds a second transaction). */
  async function prepare(cmds: Command[]): Promise<NewEntry[]> {
    const { c, cmds: ready } = await withIou(await catalog.load(), cmds);
    // ponytail: each Paid back is checked against what is saved, so two in one batch could overfill a bill together.
    for (const cmd of ready) await checkBills(c, cmd);
    const at = now();
    const entries: NewEntry[] = ready.map(cmd => ({
      kind: 'USER',
      command: cmd,
      txs: build(c, cmd, at),
    }));
    for (const e of entries) {
      checkShown(c, e.txs);
      for (const tx of e.txs) assertBalanced(tx, id => c.accountOf(id));
    }
    return entries;
  }

  /** Live Paid back links to these bills. */
  async function linksTo(billIds: string[]): Promise<(Link & { command: Transfer })[]> {
    return (await repos.entries.linksTo(ws, billIds)).map(r => {
      const command = r.command as Transfer;
      return {
        payback: r.id,
        bill: r.bill,
        tab: command.fromAccountId,
        amount: r.amount,
        date: command.date,
        command,
      };
    });
  }

  /** A Paid back's `bills`: out of a person's tab, each bill once, on that person, never more than is left on it. */
  async function checkBills(c: Snapshot, cmd: Command, except?: string) {
    if (cmd.type !== 'TRANSFER' || !cmd.bills?.length) return;
    const tab = c.account(cmd.fromAccountId);
    if (tab.row.kind !== 'IOU')
      throw new DomainError('NOT_IOU', "Only a person's Paid back pays a bill");
    const ids = cmd.bills.map(b => b.entryId);
    if (new Set(ids).size !== ids.length) throw new DomainError('INVALID_BILLS', 'Each bill once');
    if (cmd.bills.reduce((s, b) => s + b.amount, 0) > cmd.amount - (cmd.gift ?? 0))
      throw new DomainError('INVALID_BILLS', 'The bills add up to more than was paid back');
    const bills = await repos.entries.billsOf(ws, tab.id);
    const links = (await linksTo(ids)).filter(l => l.payback !== except);
    for (const b of cmd.bills) {
      const bill = bills.find(x => x.id === b.entryId);
      const person =
        bill &&
        peopleOf(bill.id, bill.transactions, isTabOf(c), links).find(p => p.tabId === tab.id);
      if (!person) throw new DomainError('NOT_ON_BILL', `${tab.row.name} is not on that bill`);
      if (b.amount > person.share - person.paid)
        throw new DomainError(
          'BILL_OVERPAID',
          `That's more than ${tab.row.name} has left on the bill`,
        );
    }
  }

  /**
   * The statements that rewrite the Paid backs tied to a bill whose shares become `after` (empty = deleted). Without a
   * mode, any Paid back left over a share refuses the change (PAYBACKS_TIED) so the app can ask first.
   * NEVER_RECEIVED: the Paid back shrinks by the part that no longer fits (deleted when only its gift would be left).
   * RETURN: the money stays; only the link shrinks, so the tab goes below 0 (you owe them).
   */
  async function settle(
    c: Snapshot,
    billId: string,
    after: ReturnType<typeof tabsOnBill>,
    mode?: PaybackMode,
  ): Promise<D1PreparedStatement[]> {
    const cuts = cutsFor(await linksTo([billId]), after);
    if (!cuts.length) return [];
    if (!mode)
      throw new DomainError(
        'PAYBACKS_TIED',
        'Someone already paid back more than this leaves them. Was the money received?',
      );
    const stmts: D1PreparedStatement[] = [];
    for (const { link, cut } of cuts) {
      const cmd = link.command;
      const amount = mode === 'NEVER_RECEIVED' ? cmd.amount - cut : cmd.amount;
      if (amount - (cmd.gift ?? 0) <= 0) {
        stmts.push(...repos.entries.removeStatements(ws, link.payback));
        continue;
      }
      const bills = (cmd.bills ?? [])
        .map(b => (b.entryId === billId ? { ...b, amount: b.amount - cut } : b))
        .filter(b => b.amount > 0);
      const next: Transfer = { ...cmd, amount, bills: bills.length ? bills : undefined };
      const txs = build(c, next, now());
      const old = await repos.entries.get(ws, link.payback);
      for (const t of txs) {
        if (old) t.occurredAt = old.occurred_at;
        assertBalanced(t, x => c.accountOf(x));
      }
      stmts.push(...repos.entries.replaceStatements(ws, link.payback, next, txs));
    }
    return stmts;
  }

  /**
   * The writes that save each command as one entry, with the entry ids, for a caller that batches them with
   * its own (the Inbox marks its items in the same write). An expense that pays a recurring bill also moves
   * that bill to its next due date.
   */
  async function recordStatements(cmds: Command[], entryIds?: (string | undefined)[]) {
    const entries = await prepare(cmds);
    entries.forEach((e, i) => (e.id = entryIds?.[i]));
    const { ids, stmts } = repos.entries.insertStatements(ws, entries);
    const at = new Date(now()).toISOString();
    const paid = cmds.some(c => c.type === 'EXPENSE')
      ? paidBy(await repos.recurring.list(ws), cmds)
      : [];
    return { ids, stmts: [...stmts, ...paid.map(r => advance(repos, ws, r, at))] };
  }

  /** Entries as the lists show them: the command read back, and a split bill's people. */
  async function views(entries: EntryView[]) {
    const items = entries.map(e => ({ ...e, command: commandOf(e) }));
    const bills = items.filter(e => e.command?.type === 'EXPENSE' && e.command.split);
    const [c, links] = await Promise.all([catalog.load(), linksTo(bills.map(b => b.id))]);
    return items.map(e => ({
      ...e,
      people: bills.includes(e) ? peopleOf(e.id, e.transactions, isTabOf(c), links) : null,
    }));
  }

  return {
    prepare,
    recordStatements,

    /**
     * Saves each command as one entry, in one write; returns the entry ids. `entryIds` (same order) are ids the
     * phone made: one that already names an entry, deleted or not, was saved by an earlier try whose answer got
     * lost, so it is skipped and reported as saved. That makes a repeat harmless.
     */
    async record(cmds: Command[], entryIds?: (string | undefined)[]): Promise<string[]> {
      const given = (entryIds ?? []).filter((x): x is string => Boolean(x));
      const taken = await repos.entries.taken(ws, given);
      const fresh = cmds.flatMap((cmd, i) => {
        const id = entryIds?.[i];
        return id && taken.has(id) ? [] : [{ cmd, id }];
      });
      if (!fresh.length) return given;
      const { ids, stmts } = await recordStatements(
        fresh.map(f => f.cmd),
        fresh.map(f => f.id),
      );
      await repos.batch(stmts);
      const made = [...ids];
      return cmds.map((_, i) => {
        const id = entryIds?.[i];
        return id && taken.has(id) ? id : made.shift()!;
      });
    },

    /**
     * Rebuilds an entry from an edited command. Its type is fixed; a same-day edit keeps the original time.
     * `base` = the version the edit was made against (an edit kept on a phone while it had no signal): when the
     * entry has moved on since, the edit is refused (ENTRY_CHANGED) so the owner can choose. Returns the new version.
     * ponytail: checked before the write, not inside it; two edits landing in the same instant both pass.
     */
    async edit(id: string, cmd: Command, mode?: PaybackMode, base?: number): Promise<number> {
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
      if (base !== undefined && base !== entry.version)
        throw new DomainError('ENTRY_CHANGED', 'This entry was changed somewhere else');
      if (entry.kind !== 'USER')
        throw new DomainError('NOT_EDITABLE', 'Use Update balance to change this');
      if (commandOf(entry)?.type !== cmd.type)
        throw new DomainError(
          'TYPE_LOCKED',
          'An entry keeps its type. Delete it and add a new one instead.',
        );
      const {
        c,
        cmds: [ready],
      } = await withIou(await catalog.load(), [cmd]);
      const txs = build(c, ready, now());
      if (cmd.date === entry.occurred_at.slice(0, 10))
        for (const t of txs) t.occurredAt = entry.occurred_at;
      checkShown(
        c,
        txs,
        new Set(
          entry.transactions.flatMap(t => [
            ...t.entries.map(x => x.account_id),
            ...t.allocations.map(x => x.envelope_id),
          ]),
        ),
      );
      for (const tx of txs) assertBalanced(tx, x => c.accountOf(x));
      await checkBills(c, ready, id);
      const tied =
        ready.type === 'EXPENSE' ? await settle(c, id, tabsOnBill(txs, isTabOf(c)), mode) : [];
      await repos.batch([...repos.entries.replaceStatements(ws, id, ready, txs), ...tied]);
      return entry.version + 1;
    },

    /** Deletes an entry; a bill with Paid backs tied to it needs a mode (see `settle`). */
    async remove(id: string, mode?: PaybackMode): Promise<void> {
      if (!(await repos.entries.get(ws, id))) throw new DomainError('NOT_FOUND', 'Entry not found');
      const tied = await settle(await catalog.load(), id, new Map(), mode);
      await repos.batch([...repos.entries.removeStatements(ws, id), ...tied]);
    },

    /** Entries, newest first; each split bill carries its people (share, paid, Paid backs). */
    async listEntries(f: TxFilter) {
      const page = await repos.entries.listEntries(ws, f);
      return { ...page, items: await views(page.items) };
    },

    /** One entry as the list sends it (what an edit kept on a phone is compared with when it clashes). */
    async entry(id: string) {
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
      return (await views([entry]))[0];
    },

    /** A person's split bills, oldest first, with their share and what they paid (`except`: a Paid back being edited). */
    async tabBills(tabId: string, except?: string) {
      const c = await catalog.load();
      if (c.account(tabId).row.kind !== 'IOU')
        throw new DomainError('NOT_IOU', 'Only a person has bills to pay back');
      const bills = await repos.entries.billsOf(ws, tabId);
      const links = (await linksTo(bills.map(b => b.id))).filter(l => l.payback !== except);
      return bills
        .flatMap(b => {
          const me = peopleOf(b.id, b.transactions, isTabOf(c), links).find(p => p.tabId === tabId);
          const cmd = commandOf(b);
          const title =
            (cmd?.type === 'EXPENSE' && cmd.merchant) || b.transactions[0]?.note || 'Split bill';
          // Where the bill was paid from: a Paid back for it starts there.
          const from =
            cmd?.type === 'EXPENSE'
              ? { accountId: cmd.accountId, envelopeId: cmd.envelopeId ?? null }
              : { accountId: null, envelopeId: null };
          return me && me.share > 0
            ? [
                {
                  entryId: b.id,
                  occurredAt: b.occurred_at,
                  title,
                  share: me.share,
                  paid: me.paid,
                  ...from,
                },
              ]
            : [];
        })
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    listTransactions: (f: TxFilter) => repos.entries.list(ws, f),

    /**
     * Sets an entry's icon (one emoji; null = back to its category's). With `forMerchant`, the icon is also
     * remembered for the entry's merchant, so later entries there show it too.
     */
    async setIcon(id: string, i: { icon: string | null; forMerchant: boolean }) {
      const icon = i.icon?.trim() || null;
      if (
        icon &&
        (!/\p{Extended_Pictographic}/u.test(icon) ||
          [...new Intl.Segmenter().segment(icon)].length !== 1)
      ) {
        throw new DomainError('NOT_AN_EMOJI', 'Pick one emoji');
      }
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
      const merchant = i.forMerchant
        ? (entry.transactions.find(t => t.merchant)?.merchant ?? null)
        : null;
      await repos.entries.setIcon(ws, id, icon, merchant);
    },

    async balances() {
      const [c, b] = await Promise.all([catalog.load(), repos.entries.balances(ws)]);
      return {
        accounts: c.accounts
          .filter(a => !a.archived_at)
          .map(a => ({ ...a, balance: b.accounts[a.id] ?? 0 })),
        envelopes: c.envelopes
          .filter(e => !e.archived_at)
          .map(e => ({ ...e, balance: b.envelopes[e.id] ?? 0 })),
      };
    },
  };
}
