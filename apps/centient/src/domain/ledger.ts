// Ledger rules. Every transaction has entry lines (money in accounts) and allocation lines (money in
// pockets). A pocket (envelope) belongs to one account, so for every account, SUM(its entries) =
// SUM(allocations to its pockets): an account's balance is always the sum of its pockets.

export class DomainError extends Error {
  constructor(public code: string, message = code) { super(message); }
}

export type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ALLOCATE';
export type AccountRef = { id: string; currency: string };
export type EnvelopeRef = { id: string; currency: string; kind: string; accountId: string };

export type NewTransaction = {
  type: TxType;
  occurredAt: string;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  spreadCycles?: number;
  entries: { accountId: string; amount: number }[];
  allocations: { envelopeId: string; amount: number }[];
};

type Meta = { occurredAt: string; merchant?: string | null; note?: string | null };

function positive(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('INVALID_AMOUNT', 'Amount must be a positive whole number of minor units');
}

/** A pocket must belong to the account the money is in (which also makes the currency match). */
function inAccount(account: AccountRef, pocket: EnvelopeRef): void {
  if (pocket.accountId !== account.id) throw new DomainError('POCKET_ACCOUNT', 'That pocket belongs to another account');
}

const meta = (m: Meta) => ({ occurredAt: m.occurredAt, merchant: m.merchant?.trim().toLowerCase() || null, note: m.note?.trim() || null });

export function expense(i: Meta & { account: AccountRef; envelope: EnvelopeRef; categoryId: string; amount: number; originalAmount?: number | null; originalCurrency?: string | null; spreadCycles?: number }): NewTransaction {
  positive(i.amount);
  inAccount(i.account, i.envelope);
  return {
    type: 'EXPENSE', ...meta(i), categoryId: i.categoryId,
    originalAmount: i.originalAmount ?? null, originalCurrency: i.originalCurrency ?? null, spreadCycles: i.spreadCycles ?? 1,
    entries: [{ accountId: i.account.id, amount: -i.amount }],
    allocations: [{ envelopeId: i.envelope.id, amount: -i.amount }],
  };
}

/** `signed` allows a negative amount; only the opening balance of a card or paylater uses it. */
export function income(i: Meta & { account: AccountRef; envelope: EnvelopeRef; categoryId: string; amount: number; signed?: boolean }): NewTransaction {
  if (i.signed) { if (!Number.isSafeInteger(i.amount) || i.amount === 0) throw new DomainError('INVALID_AMOUNT'); }
  else positive(i.amount);
  inAccount(i.account, i.envelope);
  return {
    type: 'INCOME', ...meta(i), categoryId: i.categoryId,
    entries: [{ accountId: i.account.id, amount: i.amount }],
    allocations: [{ envelopeId: i.envelope.id, amount: i.amount }],
  };
}

/**
 * Moves money between accounts: out of a pocket of one, into a pocket of the other.
 * Cross-currency (an exchange) also needs `toAmount`, what arrived.
 */
export function transfer(i: Meta & { from: AccountRef; to: AccountRef; amount: number; toAmount?: number; fromEnvelope: EnvelopeRef; toEnvelope: EnvelopeRef }): NewTransaction {
  positive(i.amount);
  if (i.from.id === i.to.id) throw new DomainError('SAME_ACCOUNT', 'Pick two different accounts');
  inAccount(i.from, i.fromEnvelope);
  inAccount(i.to, i.toEnvelope);
  let received = i.amount;
  if (i.from.currency === i.to.currency) {
    if (i.toAmount !== undefined && i.toAmount !== i.amount) throw new DomainError('INVALID_AMOUNT', 'Same-currency transfers move one amount');
  } else {
    if (i.toAmount === undefined) throw new DomainError('EXCHANGE_NEEDS_DETAILS', 'An exchange needs the amount received');
    positive(i.toAmount);
    received = i.toAmount;
  }
  return {
    type: 'TRANSFER', ...meta(i), categoryId: null,
    entries: [{ accountId: i.from.id, amount: -i.amount }, { accountId: i.to.id, amount: received }],
    allocations: [{ envelopeId: i.fromEnvelope.id, amount: -i.amount }, { envelopeId: i.toEnvelope.id, amount: received }],
  };
}

/** Moves money between two pockets of the same account; the account's balance does not change. */
export function allocate(i: Meta & { from: EnvelopeRef; to: EnvelopeRef; amount: number }): NewTransaction {
  positive(i.amount);
  if (i.from.id === i.to.id) throw new DomainError('SAME_ENVELOPE', 'Pick two different pockets');
  if (i.from.accountId !== i.to.accountId) throw new DomainError('POCKET_ACCOUNT', 'Pockets must be in the same account; transfer between accounts instead');
  return {
    type: 'ALLOCATE', ...meta(i), categoryId: null, entries: [],
    allocations: [{ envelopeId: i.from.id, amount: -i.amount }, { envelopeId: i.to.id, amount: i.amount }],
  };
}

/** Split bill: others pay equal whole-rupiah shares; your share takes the rounding. */
export function splitShares(amount: number, people: number): { mine: number; others: number } {
  if (!Number.isInteger(people) || people < 2) throw new DomainError('INVALID_SPLIT', 'Split needs 2 or more people');
  const others = Math.floor(amount / people) * (people - 1);
  return { mine: amount - others, others };
}

/** The invariant every write must keep: per account, money in = money in its pockets. `accountOf` maps a pocket id to its account. */
export function assertBalanced(tx: NewTransaction, accountOf: (pocketId: string) => string): void {
  const sums = new Map<string, number>();
  for (const e of tx.entries) sums.set(e.accountId, (sums.get(e.accountId) ?? 0) + e.amount);
  for (const a of tx.allocations) { const acc = accountOf(a.envelopeId); sums.set(acc, (sums.get(acc) ?? 0) - a.amount); }
  for (const [acc, diff] of sums) if (diff !== 0) throw new DomainError('UNBALANCED', `Account ${acc} unbalanced by ${diff}`);
}
