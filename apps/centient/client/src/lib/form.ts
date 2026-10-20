// The entry form behind chips and sheets: built from a parsed draft or a saved command, turned back into
// an API command, and judged for the chip (ready / one question / needs the form).
import type { Draft } from '@centient/quickadd';
import type { Command } from '../../../src/application/usecases';
import { formatMoney } from './format';

export type EntryType = Command['type'];
export type Form = {
  type: EntryType; amount: number | null; date: string;
  accountId: string | null; toAccountId: string | null; categoryId: string | null; envelopeId: string | null;
  fromEnvelopeId: string | null; toEnvelopeId: string | null;
  merchant: string; note: string; split: number | null; iouAccountId: string | null; fee: number | null;
  originalAmount: number | null; originalCurrency: string | null;
};

/** One line part from the log box, with the questions it still needs answered. */
export type LogItem = {
  key: string; text: string; form: Form; candidates: number[];
  askAmount: boolean; askCharged: boolean; rawMerchant: string; suggestedMerchant: string;
};

export const blankForm = (date: string, type: EntryType = 'EXPENSE'): Form => ({
  type, amount: null, date, accountId: null, toAccountId: null, categoryId: null, envelopeId: null,
  fromEnvelopeId: null, toEnvelopeId: null, merchant: '', note: '', split: null, iouAccountId: null, fee: null,
  originalAmount: null, originalCurrency: null,
});

export function fromDraft(d: Draft, key: string, iouAccountId: string | null): LogItem {
  return {
    key, text: d.text, candidates: d.candidates, rawMerchant: d.rawMerchant, suggestedMerchant: d.merchant,
    askAmount: d.needsConfirm, askCharged: d.needs === 'CHARGED_AMOUNT',
    form: {
      ...blankForm(d.date, d.type), amount: d.amount, accountId: d.accountId, toAccountId: d.toAccountId, categoryId: d.categoryId,
      merchant: d.merchant, note: d.note, split: d.split, iouAccountId: d.split ? iouAccountId : null, fee: d.fee,
      originalAmount: d.originalAmount, originalCurrency: d.originalCurrency,
    },
  };
}

export function fromCommand(c: Command): Form {
  const f = { ...blankForm(c.date, c.type), amount: c.amount, note: c.note ?? '' };
  switch (c.type) {
    case 'EXPENSE':
      return { ...f, accountId: c.accountId, categoryId: c.categoryId, envelopeId: c.envelopeId ?? null, merchant: c.merchant ?? '',
        split: c.split?.people ?? null, iouAccountId: c.split?.iouAccountId ?? null, originalAmount: c.originalAmount ?? null, originalCurrency: c.originalCurrency ?? null };
    case 'INCOME':
      return { ...f, accountId: c.accountId, categoryId: c.categoryId, envelopeId: c.envelopeId ?? null, merchant: c.merchant ?? '' };
    case 'TRANSFER':
      return { ...f, accountId: c.fromAccountId, toAccountId: c.toAccountId, fee: c.fee ?? null };
    case 'ALLOCATE':
      return { ...f, fromEnvelopeId: c.fromEnvelopeId, toEnvelopeId: c.toEnvelopeId };
  }
}

const opt = (s: string) => s.trim() || undefined;

/** The API command, or the first thing missing, in plain words. */
export function toCommand(f: Form): { command: Command } | { error: string } {
  if (!f.amount || f.amount <= 0) return { error: 'Enter an amount' };
  const base = { amount: f.amount, date: f.date, note: opt(f.note) };
  switch (f.type) {
    case 'EXPENSE':
    case 'INCOME': {
      if (!f.accountId) return { error: 'Pick an account' };
      if (!f.categoryId) return { error: 'Pick a category' };
      const common = { ...base, accountId: f.accountId, categoryId: f.categoryId, envelopeId: f.envelopeId ?? undefined, merchant: opt(f.merchant) };
      if (f.type === 'INCOME') return { command: { type: 'INCOME', ...common } };
      if (f.split && f.split > 1 && !f.iouAccountId) return { error: 'Pick who owes you' };
      return {
        command: {
          type: 'EXPENSE', ...common,
          split: f.split && f.split > 1 ? { people: f.split, iouAccountId: f.iouAccountId! } : undefined,
          originalAmount: f.originalAmount ?? undefined, originalCurrency: f.originalCurrency ?? undefined,
        },
      };
    }
    case 'TRANSFER':
      if (!f.accountId) return { error: 'Pick where the money came from' };
      if (!f.toAccountId) return { error: 'Pick where the money went' };
      if (f.accountId === f.toAccountId) return { error: 'Pick two different accounts' };
      return { command: { type: 'TRANSFER', ...base, fromAccountId: f.accountId, toAccountId: f.toAccountId, fee: f.fee || undefined } };
    case 'ALLOCATE':
      if (!f.fromEnvelopeId || !f.toEnvelopeId) return { error: 'Pick both Pockets' };
      if (f.fromEnvelopeId === f.toEnvelopeId) return { error: 'Pick two different Pockets' };
      return { command: { type: 'ALLOCATE', ...base, fromEnvelopeId: f.fromEnvelopeId, toEnvelopeId: f.toEnvelopeId } };
  }
}

export type ChipView =
  | { state: 'ready' }
  | { state: 'ask'; ask: 'charged' | 'amount' | 'account'; question: string }
  | { state: 'incomplete'; missing: string };

/** What the chip shows. Questions come one at a time, most important first. */
export function chipView(i: LogItem): ChipView {
  const f = i.form;
  if (i.askCharged && f.originalAmount !== null) {
    return { state: 'ask', ask: 'charged', question: `How much rupiah was charged for ${formatMoney(f.originalAmount, f.originalCurrency ?? 'USD')}?` };
  }
  if (i.askAmount) return { state: 'ask', ask: 'amount', question: 'Which amount did you mean?' };
  if (f.type !== 'ALLOCATE' && !f.accountId) return { state: 'ask', ask: 'account', question: 'Which account?' };
  const r = toCommand(f);
  return 'error' in r ? { state: 'incomplete', missing: r.error } : { state: 'ready' };
}
