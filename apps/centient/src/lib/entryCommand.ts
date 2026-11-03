// The command an entry was logged with: its saved one, or (for single-transaction rows from before entry groups)
// one rebuilt from the transaction, so old entries open in the same form as new ones.
import type { Command } from './schemas';
import type { EntryView, TxView } from '../repos/entries';

export function commandOf(e: EntryView): Command | null {
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
      const [e] = t.entries,
        [a] = t.allocations;
      if (!e || !a || !t.category_id) return null;
      return {
        type: t.type,
        accountId: e.account_id,
        envelopeId: a.envelope_id,
        categoryId: t.category_id,
        amount: Math.abs(e.amount),
        date,
        merchant: t.merchant ?? undefined,
        note,
        ...(t.type === 'EXPENSE' && t.original_amount
          ? {
              originalAmount: t.original_amount,
              originalCurrency: t.original_currency ?? undefined,
            }
          : {}),
      };
    }
    case 'TRANSFER': {
      const from = out(t.entries, x => x.amount),
        to = inn(t.entries, x => x.amount);
      if (!from || !to) return null;
      return {
        type: 'TRANSFER',
        fromAccountId: from.account_id,
        toAccountId: to.account_id,
        amount: -from.amount,
        toAmount: to.amount !== -from.amount ? to.amount : undefined,
        date,
        note,
        fromEnvelopeId: out(t.allocations, x => x.amount)?.envelope_id,
        toEnvelopeId: inn(t.allocations, x => x.amount)?.envelope_id,
      };
    }
    case 'ALLOCATE': {
      const from = out(t.allocations, x => x.amount),
        to = inn(t.allocations, x => x.amount);
      if (!from || !to) return null;
      return {
        type: 'ALLOCATE',
        fromEnvelopeId: from.envelope_id,
        toEnvelopeId: to.envelope_id,
        amount: -from.amount,
        date,
        note,
      };
    }
  }
  return null;
}
