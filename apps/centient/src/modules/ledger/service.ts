// Ledger use cases: log, edit, delete and list what the user spent, earned and moved.
// Every referenced account, pocket and category is checked against this workspace's catalog.
import type { ServiceDeps } from '../../context';
import type { Snapshot } from '../../lib/catalog';
import type { Command } from '../../lib/schemas';
import { toOccurredAt } from '../../domain/cycle';
import { allocate, assertBalanced, DomainError, expense, income, splitShares, transfer, type NewTransaction } from '../../domain/ledger';
import type { EntryView, NewEntry, TxFilter, TxView } from '../../repos/entries';

export type LedgerService = ReturnType<typeof createLedgerService>;

export function createLedgerService({ ws, now, repos, catalog }: ServiceDeps) {
  /**
   * A split bill needs an IOU account for what the others owe. New workspaces start without one, so the
   * first split creates "Friends owe you" (named Friends) and later splits reuse the first IOU account.
   */
  async function withIou(c: Snapshot, cmds: Command[]): Promise<{ c: Snapshot; cmds: Command[] }> {
    if (!cmds.some(x => x.type === 'EXPENSE' && x.split && !x.split.iouAccountId)) return { c, cmds };
    let iou = c.accounts.find(a => a.kind === 'IOU' && !a.archived_at);
    if (!iou) {
      await repos.accounts.create(ws, { name: 'Friends', kind: 'IOU', provider: null, currency_code: 'IDR', due_day: null });
      catalog.invalidate();
      c = await catalog.load();
      iou = c.accounts.find(a => a.kind === 'IOU')!;
    }
    const id = iou.id;
    return { c, cmds: cmds.map(x => (x.type === 'EXPENSE' && x.split && !x.split.iouAccountId ? { ...x, split: { ...x.split, iouAccountId: id } } : x)) };
  }

  return {
    /** Saves each command as one entry (a split or a fee adds a second transaction to it); returns the entry ids. */
    async record(cmds: Command[]): Promise<string[]> {
      const { c, cmds: ready } = await withIou(await catalog.load(), cmds);
      const at = now();
      const entries: NewEntry[] = ready.map(cmd => ({ kind: 'USER', command: cmd, txs: build(c, cmd, at) }));
      for (const e of entries) for (const tx of e.txs) assertBalanced(tx, id => c.accountOf(id));
      return repos.entries.insert(ws, entries);
    },

    /** Rebuilds an entry from an edited command. Its type is fixed; a same-day edit keeps the original time. */
    async edit(id: string, cmd: Command): Promise<void> {
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
      if (entry.kind !== 'USER') throw new DomainError('NOT_EDITABLE', 'Use Update balance to change this');
      if (commandOf(entry)?.type !== cmd.type) throw new DomainError('TYPE_LOCKED', 'An entry keeps its type. Delete it and add a new one instead.');
      const { c, cmds: [ready] } = await withIou(await catalog.load(), [cmd]);
      const txs = build(c, ready, now());
      if (cmd.date === entry.occurred_at.slice(0, 10)) for (const t of txs) t.occurredAt = entry.occurred_at;
      for (const tx of txs) assertBalanced(tx, x => c.accountOf(x));
      await repos.entries.replace(ws, id, ready, txs);
    },

    async remove(id: string): Promise<void> {
      if (!(await repos.entries.remove(ws, id))) throw new DomainError('NOT_FOUND', 'Entry not found');
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
      if (icon && (!/\p{Extended_Pictographic}/u.test(icon) || [...new Intl.Segmenter().segment(icon)].length !== 1)) {
        throw new DomainError('NOT_AN_EMOJI', 'Pick one emoji');
      }
      const entry = await repos.entries.get(ws, id);
      if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
      const merchant = i.forMerchant ? entry.transactions.find(t => t.merchant)?.merchant ?? null : null;
      await repos.entries.setIcon(ws, id, icon, merchant);
    },

    async balances() {
      const [c, b] = await Promise.all([catalog.load(), repos.entries.balances(ws)]);
      return {
        accounts: c.accounts.filter(a => !a.archived_at).map(a => ({ ...a, balance: b.accounts[a.id] ?? 0 })),
        envelopes: c.envelopes.filter(e => !e.archived_at).map(e => ({ ...e, balance: b.envelopes[e.id] ?? 0 })),
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
      const base = { occurredAt, account, envelope, categoryId, merchant: cmd.merchant, note: cmd.note, originalAmount: cmd.originalAmount, originalCurrency: cmd.originalCurrency };
      if (!cmd.split) return [expense({ ...base, amount: cmd.amount })];
      // Split bill: my share is spending; the rest is money the others owe me.
      const { mine, others } = splitShares(cmd.amount, cmd.split.people);
      const iou = c.account(cmd.split.iouAccountId);
      if (iou.row.kind !== 'IOU') throw new DomainError('NOT_IOU', 'Split must go to an IOU account');
      const note = `Split ${cmd.split.people} ways${cmd.note ? ` · ${cmd.note}` : ''}`;
      return [
        expense({ ...base, amount: mine, note }),
        transfer({ occurredAt, from: account, to: iou, amount: others, merchant: cmd.merchant, note, fromEnvelope: envelope, toEnvelope: c.defaultEnvelope(iou.row) }),
      ];
    }
    case 'INCOME': {
      const account = c.account(cmd.accountId);
      const envelope = c.pocketOf(account.row, cmd.envelopeId);
      return [income({ occurredAt, account, envelope, categoryId: c.category(cmd.categoryId, 'INCOME').id, amount: cmd.amount, merchant: cmd.merchant, note: cmd.note })];
    }
    case 'TRANSFER': {
      const from = c.account(cmd.fromAccountId);
      const to = c.account(cmd.toAccountId);
      const fromEnvelope = c.pocketOf(from.row, cmd.fromEnvelopeId);
      const txs = [transfer({
        occurredAt, from, to, amount: cmd.amount, toAmount: cmd.toAmount, note: cmd.note,
        fromEnvelope, toEnvelope: c.pocketOf(to.row, cmd.toEnvelopeId),
      })];
      // The admin fee is its own expense, so it shows up in spending.
      if (cmd.fee) {
        const fees = c.categoryByName('Fees');
        if (!fees) throw new DomainError('NO_FEES_CATEGORY', 'Create a "Fees" expense category first');
        txs.push(expense({ occurredAt, account: from, envelope: fromEnvelope, categoryId: fees.id, amount: cmd.fee, note: 'Transfer fee' }));
      }
      return txs;
    }
    case 'ALLOCATE':
      return [allocate({ occurredAt, from: c.envelope(cmd.fromEnvelopeId), to: c.envelope(cmd.toEnvelopeId), amount: cmd.amount, note: cmd.note })];
  }
}

/** The saved command, or one read back from a single transaction saved before entries existed. */
function commandOf(e: EntryView): Command | null {
  if (e.command) return e.command as Command;
  return e.kind === 'USER' && e.transactions.length === 1 ? commandFromTx(e.transactions[0]) : null;
}

function commandFromTx(t: TxView): Command | null {
  const date = t.occurred_at.slice(0, 10);
  const note = t.note ?? undefined;
  const out = <T>(rows: T[], pick: (r: T) => number) => rows.find(r => pick(r) < 0);
  const inn = <T>(rows: T[], pick: (r: T) => number) => rows.find(r => pick(r) > 0);
  switch (t.type) {
    case 'EXPENSE':
    case 'INCOME': {
      const [e] = t.entries, [a] = t.allocations;
      if (!e || !a || !t.category_id) return null;
      return {
        type: t.type, accountId: e.account_id, envelopeId: a.envelope_id, categoryId: t.category_id, amount: Math.abs(e.amount), date,
        merchant: t.merchant ?? undefined, note,
        ...(t.type === 'EXPENSE' && t.original_amount ? { originalAmount: t.original_amount, originalCurrency: t.original_currency ?? undefined } : {}),
      };
    }
    case 'TRANSFER': {
      const from = out(t.entries, x => x.amount), to = inn(t.entries, x => x.amount);
      if (!from || !to) return null;
      return {
        type: 'TRANSFER', fromAccountId: from.account_id, toAccountId: to.account_id, amount: -from.amount,
        toAmount: to.amount !== -from.amount ? to.amount : undefined, date, note,
        fromEnvelopeId: out(t.allocations, x => x.amount)?.envelope_id, toEnvelopeId: inn(t.allocations, x => x.amount)?.envelope_id,
      };
    }
    case 'ALLOCATE': {
      const from = out(t.allocations, x => x.amount), to = inn(t.allocations, x => x.amount);
      if (!from || !to) return null;
      return { type: 'ALLOCATE', fromEnvelopeId: from.envelope_id, toEnvelopeId: to.envelope_id, amount: -from.amount, date, note };
    }
  }
  return null;
}
