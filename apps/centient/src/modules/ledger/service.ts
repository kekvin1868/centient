// Ledger use cases: log, edit, delete and list what the user spent, earned and moved.
// Every referenced account, pocket and category is checked against this workspace's catalog.
import type { ServiceDeps } from '../../context';
import type { Snapshot } from '../../lib/catalog';
import type { Command } from '../../lib/schemas';
import { toOccurredAt } from '../../domain/cycle';
import {
  allocate,
  assertBalanced,
  DomainError,
  expense,
  income,
  splitShares,
  transfer,
  type NewTransaction,
} from '../../domain/ledger';
import { commandOf } from '../../lib/entryCommand';
import { findOrCreateTab } from './tabs';
import type { NewEntry, TxFilter } from '../../repos/entries';

export type LedgerService = ReturnType<typeof createLedgerService>;

export function createLedgerService({ ws, now, repos, catalog }: ServiceDeps) {
  /**
   * Gets a split bill's IOU accounts ready. Named people get their own tab (found by name in the bill's currency,
   * or made); a split with unnamed people, or an old one without `parties`, goes to a lump account: the one given,
   * else the IOU account named "Friends" (made if missing; never a person's tab). The saved command keeps ids only, so a rename follows.
   */
  async function withIou(c: Snapshot, cmds: Command[]): Promise<{ c: Snapshot; cmds: Command[] }> {
    const out: Command[] = [];
    for (const x of cmds) {
      if (x.type !== 'EXPENSE' || !x.split) {
        out.push(x);
        continue;
      }
      const split = { ...x.split };
      const parties = split.parties;
      if (parties) {
        if (parties.length + 1 !== split.people)
          throw new DomainError('INVALID_SPLIT', 'Split people and shares do not match');
        const currency = c.account(x.accountId).row.currency_code;
        const resolved: NonNullable<typeof parties> = [];
        for (const p of parties) {
          let iouAccountId = p.iouAccountId;
          if (!iouAccountId && p.name) {
            iouAccountId = await findOrCreateTab(repos, ws, c.accounts, p.name, currency);
            catalog.invalidate();
            c = await catalog.load();
          }
          if (p.paid && !iouAccountId)
            throw new DomainError('PAID_NEEDS_NAME', 'Name the person who paid');
          resolved.push({ iouAccountId, share: p.share, paid: p.paid });
        }
        const ids = resolved.flatMap(p => (p.iouAccountId ? [p.iouAccountId] : []));
        if (new Set(ids).size !== ids.length)
          throw new DomainError('DUPLICATE_PARTY', 'Each person once');
        split.parties = resolved;
      }
      if (!split.iouAccountId && (!split.parties || split.parties.some(p => !p.iouAccountId))) {
        let iou = c.accounts.find(
          a => a.kind === 'IOU' && !a.archived_at && a.name.toLowerCase() === 'friends',
        );
        if (!iou) {
          await repos.accounts.create(ws, {
            name: 'Friends',
            kind: 'IOU',
            provider: null,
            currency_code: 'IDR',
            due_day: null,
          });
          catalog.invalidate();
          c = await catalog.load();
          iou = c.accounts.find(a => a.kind === 'IOU' && a.name.toLowerCase() === 'friends')!;
        }
        split.iouAccountId = iou.id;
      }
      out.push({ ...x, split });
    }
    return { c, cmds: out };
  }

  /** Checks each command against the catalog and builds its entry (a split or a fee adds a second transaction). */
  async function prepare(cmds: Command[]): Promise<NewEntry[]> {
    const { c, cmds: ready } = await withIou(await catalog.load(), cmds);
    const at = now();
    const entries: NewEntry[] = ready.map(cmd => ({
      kind: 'USER',
      command: cmd,
      txs: build(c, cmd, at),
    }));
    for (const e of entries) for (const tx of e.txs) assertBalanced(tx, id => c.accountOf(id));
    return entries;
  }

  return {
    prepare,

    /** Saves each command as one entry; returns the entry ids. */
    async record(cmds: Command[]): Promise<string[]> {
      return repos.entries.insert(ws, await prepare(cmds));
    },

    /** Rebuilds an entry from an edited command. Its type is fixed; a same-day edit keeps the original time. */
    async edit(id: string, cmd: Command): Promise<void> {
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
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
      for (const tx of txs) assertBalanced(tx, x => c.accountOf(x));
      await repos.entries.replace(ws, id, ready, txs);
    },

    async remove(id: string): Promise<void> {
      if (!(await repos.entries.remove(ws, id)))
        throw new DomainError('NOT_FOUND', 'Entry not found');
    },

    async listEntries(f: TxFilter) {
      const page = await repos.entries.listEntries(ws, f);
      return { ...page, items: page.items.map(e => ({ ...e, command: commandOf(e) })) };
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

function build(c: Snapshot, cmd: Command, now: number): NewTransaction[] {
  const occurredAt = toOccurredAt(cmd.date, now);
  switch (cmd.type) {
    case 'EXPENSE': {
      const account = c.account(cmd.accountId);
      const envelope = c.pocketOf(account.row, cmd.envelopeId);
      const categoryId = c.category(cmd.categoryId, 'EXPENSE').id;
      const base = {
        occurredAt,
        account,
        envelope,
        categoryId,
        merchant: cmd.merchant,
        note: cmd.note,
        originalAmount: cmd.originalAmount,
        originalCurrency: cmd.originalCurrency,
      };
      if (cmd.pot) {
        if (cmd.split) throw new DomainError('INVALID_SPLIT', 'A pot is not a split bill');
        if (cmd.amount > cmd.pot.total)
          throw new DomainError('INVALID_SHARE', 'Your share cannot be more than the pot');
        const who = cmd.pot.manager ? `, run by ${cmd.pot.manager}` : '';
        const note = `Pot of ${cmd.pot.people} people${who}${cmd.note ? ` · ${cmd.note}` : ''}`;
        return [expense({ ...base, amount: cmd.amount, note })];
      }
      if (!cmd.split) return [expense({ ...base, amount: cmd.amount })];
      // Split bill: my share is spending; the rest is money the others owe me.
      const ps = cmd.split.parties;
      const owed = (iouId: string, amount: number, note: string) => {
        const iou = c.account(iouId);
        if (iou.row.kind !== 'IOU')
          throw new DomainError('NOT_IOU', 'Split must go to an IOU account');
        return transfer({
          occurredAt,
          from: account,
          to: iou,
          amount,
          merchant: cmd.merchant,
          note,
          fromEnvelope: envelope,
          toEnvelope: c.defaultEnvelope(iou.row),
        });
      };
      // A person handing money over now: out of their tab, into one of my accounts.
      const paidBack = (
        iouId: string,
        paid: { amount: number; accountId: string },
        note: string,
      ) => {
        const to = c.account(paid.accountId);
        if (to.row.kind === 'IOU')
          throw new DomainError('INVALID_PAYMENT', 'Pick one of your own accounts');
        return transfer({
          occurredAt,
          from: c.account(iouId),
          to,
          amount: paid.amount,
          merchant: cmd.merchant,
          note,
          fromEnvelope: c.defaultEnvelope(c.account(iouId).row),
          toEnvelope: c.defaultEnvelope(to.row),
        });
      };
      const tail = cmd.note ? ` · ${cmd.note}` : '';
      if (!ps) {
        const { mine, others } = splitShares(cmd.amount, cmd.split.people);
        const note = `Split ${cmd.split.people} ways${tail}`;
        return [
          expense({ ...base, amount: mine, note }),
          owed(cmd.split.iouAccountId!, others, note),
        ];
      }
      for (const p of ps)
        if (p.paid && p.paid.amount > p.share)
          throw new DomainError('INVALID_PAYMENT', 'Nobody can hand over more than their share');
      const mine = cmd.amount - ps.reduce((s, p) => s + p.share, 0);
      if (mine <= 0) throw new DomainError('INVALID_SHARE', 'Your share must be more than zero');
      const named = ps.filter(p => p.iouAccountId);
      const lump = ps.filter(p => !p.iouAccountId).reduce((s, p) => s + p.share, 0);
      const names = named.map(p => c.account(p.iouAccountId!).row.name);
      const unnamed = ps.length - named.length;
      const note = `Split with ${[...names, ...(unnamed ? [`${unnamed} more`] : [])].join(', ')}${tail}`;
      return [
        expense({ ...base, amount: mine, note }),
        ...named.flatMap(p => [
          ...(p.share > 0 ? [owed(p.iouAccountId!, p.share, note)] : []),
          ...(p.paid ? [paidBack(p.iouAccountId!, p.paid, note)] : []),
        ]),
        ...(lump > 0 ? [owed(cmd.split.iouAccountId!, lump, note)] : []),
      ];
    }
    case 'INCOME': {
      const account = c.account(cmd.accountId);
      const envelope = c.pocketOf(account.row, cmd.envelopeId);
      return [
        income({
          occurredAt,
          account,
          envelope,
          categoryId: c.category(cmd.categoryId, 'INCOME').id,
          amount: cmd.amount,
          merchant: cmd.merchant,
          note: cmd.note,
        }),
      ];
    }
    case 'TRANSFER': {
      const from = c.account(cmd.fromAccountId);
      const to = c.account(cmd.toAccountId);
      const fromEnvelope = c.pocketOf(from.row, cmd.fromEnvelopeId);
      const txs = [
        transfer({
          occurredAt,
          from,
          to,
          amount: cmd.amount,
          toAmount: cmd.toAmount,
          note: cmd.note,
          fromEnvelope,
          toEnvelope: c.pocketOf(to.row, cmd.toEnvelopeId),
        }),
      ];
      // The admin fee is its own expense, so it shows up in spending.
      if (cmd.fee) {
        const fees = c.categoryByName('Fees');
        if (!fees)
          throw new DomainError('NO_FEES_CATEGORY', 'Create a "Fees" expense category first');
        txs.push(
          expense({
            occurredAt,
            account: from,
            envelope: fromEnvelope,
            categoryId: fees.id,
            amount: cmd.fee,
            note: 'Transfer fee',
          }),
        );
      }
      return txs;
    }
    case 'ALLOCATE':
      return [
        allocate({
          occurredAt,
          from: c.envelope(cmd.fromEnvelopeId),
          to: c.envelope(cmd.toEnvelopeId),
          amount: cmd.amount,
          note: cmd.note,
        }),
      ];
  }
}

/** The saved command, or one read back from a single transaction saved before entries existed. */
