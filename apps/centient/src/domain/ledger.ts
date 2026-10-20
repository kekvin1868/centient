// Ledger rules. Every transaction has entry lines (money in accounts) and allocation lines
// (money in envelopes); for each currency, SUM(entries) = SUM(allocations).

export class DomainError extends Error {
  constructor(public code: string, message = code) { super(message); }
}

export type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ALLOCATE';
export type AccountRef = { id: string; currency: string };
export type EnvelopeRef = { id: string; currency: string; kind: string };

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

function sameCurrency(account: AccountRef, envelope: EnvelopeRef): void {
  if (account.currency !== envelope.currency) throw new DomainError('CURRENCY_MISMATCH', `Account is ${account.currency} but envelope is ${envelope.currency}`);
}

const meta = (m: Meta) => ({ occurredAt: m.occurredAt, merchant: m.merchant?.trim().toLowerCase() || null, note: m.note?.trim() || null });

export function expense(i: Meta & { account: AccountRef; envelope: EnvelopeRef; categoryId: string; amount: number; originalAmount?: number | null; originalCurrency?: string | null; spreadCycles?: number }): NewTransaction {
  positive(i.amount);
  sameCurrency(i.account, i.envelope);
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
  sameCurrency(i.account, i.envelope);
  return {
    type: 'INCOME', ...meta(i), categoryId: i.categoryId,
    entries: [{ accountId: i.account.id, amount: i.amount }],
    allocations: [{ envelopeId: i.envelope.id, amount: i.amount }],
  };
}

/**
 * Moves money between accounts. Same currency: envelopes are untouched.
 * Cross-currency (an exchange): `toAmount` and both envelopes are required, and the
 * allocations mirror the entries so each currency stays balanced.
 */
export function transfer(i: Meta & { from: AccountRef; to: AccountRef; amount: number; toAmount?: number; fromEnvelope?: EnvelopeRef; toEnvelope?: EnvelopeRef }): NewTransaction {
  positive(i.amount);
  if (i.from.id === i.to.id) throw new DomainError('SAME_ACCOUNT', 'Pick two different accounts');
  const base = { type: 'TRANSFER' as const, ...meta(i), categoryId: null };
  if (i.from.currency === i.to.currency) {
    if (i.toAmount !== undefined && i.toAmount !== i.amount) throw new DomainError('INVALID_AMOUNT', 'Same-currency transfers move one amount');
    return { ...base, entries: [{ accountId: i.from.id, amount: -i.amount }, { accountId: i.to.id, amount: i.amount }], allocations: [] };
  }
  if (i.toAmount === undefined || !i.fromEnvelope || !i.toEnvelope) throw new DomainError('EXCHANGE_NEEDS_DETAILS', 'An exchange needs the received amount and both envelopes');
  positive(i.toAmount);
  sameCurrency(i.from, i.fromEnvelope);
  sameCurrency(i.to, i.toEnvelope);
  return {
    ...base,
    entries: [{ accountId: i.from.id, amount: -i.amount }, { accountId: i.to.id, amount: i.toAmount }],
    allocations: [{ envelopeId: i.fromEnvelope.id, amount: -i.amount }, { envelopeId: i.toEnvelope.id, amount: i.toAmount }],
  };
}

export function allocate(i: Meta & { from: EnvelopeRef; to: EnvelopeRef; amount: number }): NewTransaction {
  positive(i.amount);
  if (i.from.id === i.to.id) throw new DomainError('SAME_ENVELOPE', 'Pick two different envelopes');
  if (i.from.currency !== i.to.currency) throw new DomainError('CURRENCY_MISMATCH', 'Envelopes must share a currency');
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

/** The invariant every write must keep. `currencyOf` maps account and envelope ids to their currency. */
export function assertBalanced(tx: NewTransaction, currencyOf: (id: string) => string): void {
  const sums = new Map<string, number>();
  for (const e of tx.entries) sums.set(currencyOf(e.accountId), (sums.get(currencyOf(e.accountId)) ?? 0) + e.amount);
  for (const a of tx.allocations) sums.set(currencyOf(a.envelopeId), (sums.get(currencyOf(a.envelopeId)) ?? 0) - a.amount);
  for (const [cur, diff] of sums) if (diff !== 0) throw new DomainError('UNBALANCED', `Unbalanced in ${cur} by ${diff}`);
}
