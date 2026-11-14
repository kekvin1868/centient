// Turns one command into its transactions (a split or a fee adds more), checked against a catalog snapshot.
// Pure, and shared: the ledger service builds what it saves with it, and the web app builds the lines of an
// entry that is still waiting to be sent (client/src/models/waiting.ts), so both do the same maths.
import { toOccurredAt } from '../domain/cycle';
import {
  allocate,
  DomainError,
  expense,
  income,
  splitShares,
  transfer,
  type NewTransaction,
} from '../domain/ledger';
import type { Snapshot } from './catalog';
import type { Command } from './schemas';

/** The rules of a named split that need no tabs, checked before withIou makes any. */
export function checkParties(
  amount: number,
  split: NonNullable<Extract<Command, { type: 'EXPENSE' }>['split']>,
) {
  const ps = split.parties ?? [];
  if (ps.length + 1 !== split.people)
    throw new DomainError('INVALID_SPLIT', 'Split people and shares do not match');
  if (amount - ps.reduce((s, p) => s + p.share, 0) <= 0)
    throw new DomainError('INVALID_SHARE', 'Your share must be more than zero');
  for (const p of ps) {
    if (p.paid && p.paid.amount > p.share)
      throw new DomainError('INVALID_PAYMENT', 'Nobody can hand over more than their share');
    if (p.paid && p.covered)
      throw new DomainError('INVALID_SPLIT', 'A person is covered or pays later, not both');
    if (p.paid && !p.iouAccountId && !p.name)
      throw new DomainError('PAID_NEEDS_NAME', 'Name the person who paid');
  }
  const keys = ps.flatMap(p =>
    p.iouAccountId ? [p.iouAccountId] : p.name ? [`name:${p.name.trim().toLowerCase()}`] : [],
  );
  if (new Set(keys).size !== keys.length)
    throw new DomainError('DUPLICATE_PARTY', 'Each person once');
}

export function build(c: Snapshot, cmd: Command, now: number): NewTransaction[] {
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
      const mine = cmd.amount - ps.reduce((s, p) => s + p.share, 0);
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
      // A payback's extra kept as a gift: income on the tab, in the same entry, so deleting the payback deletes it.
      if (cmd.gift) {
        const other = c.categoryByName('Other income');
        if (from.row.kind !== 'IOU' || cmd.gift > cmd.amount)
          throw new DomainError('INVALID_GIFT', 'A gift is part of what a person paid back');
        if (!other)
          throw new DomainError('NO_INCOME_CATEGORY', 'Create an "Other income" category first');
        txs.push(
          income({
            occurredAt,
            account: from,
            envelope: fromEnvelope,
            categoryId: other.id,
            amount: cmd.gift,
            note: `Gift from ${from.row.name}`,
          }),
        );
      }
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
