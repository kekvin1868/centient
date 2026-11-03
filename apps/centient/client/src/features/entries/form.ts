// The entry form behind chips and sheets: built from a parsed draft or a saved command, turned back into
// an API command, and judged for the chip (ready / one question / needs the form).
import type { Draft } from '@centient/quickadd';
import type { Command } from '../../../../src/lib/schemas';
import { formatMoney } from '../../lib/format';
import { blankParty, shareMath, withPeople, type Party } from './shares';

export type EntryType = Command['type'];
export type Form = {
  type: EntryType;
  amount: number | null;
  date: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  envelopeId: string | null;
  fromEnvelopeId: string | null;
  toEnvelopeId: string | null;
  merchant: string;
  note: string;
  /** People on the bill, me included; null = not split. */
  split: number | null;
  /** The others (`split - 1` rows) and my own typed amount (null = follows the equal split). */
  parties: Party[];
  myShare: number | null;
  /** Where unnamed people's shares go; null = the server's "Friends". */
  iouAccountId: string | null;
  fee: number | null;
  originalAmount: number | null;
  originalCurrency: string | null;
};

/** One line part from the log box, with the questions it still needs answered. */
export type LogItem = {
  key: string;
  text: string;
  form: Form;
  candidates: number[];
  askAmount: boolean;
  askCharged: boolean;
  rawMerchant: string;
  suggestedMerchant: string;
};

export const blankForm = (date: string, type: EntryType = 'EXPENSE'): Form => ({
  type,
  amount: null,
  date,
  accountId: null,
  toAccountId: null,
  categoryId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  toEnvelopeId: null,
  merchant: '',
  note: '',
  split: null,
  parties: [],
  myShare: null,
  iouAccountId: null,
  fee: null,
  originalAmount: null,
  originalCurrency: null,
});

export function fromDraft(d: Draft, key: string, iouAccountId: string | null): LogItem {
  return {
    key,
    text: d.text,
    candidates: d.candidates,
    rawMerchant: d.rawMerchant,
    suggestedMerchant: d.merchant,
    askAmount: d.needsConfirm,
    askCharged: d.needs === 'CHARGED_AMOUNT',
    form: {
      ...blankForm(d.date, d.type),
      amount: d.amount,
      accountId: d.accountId,
      toAccountId: d.toAccountId,
      categoryId: d.categoryId,
      merchant: d.merchant,
      note: d.note,
      ...withPeople({ split: null, parties: [] }, d.split ?? 1),
      iouAccountId: d.split ? iouAccountId : null,
      fee: d.fee,
      originalAmount: d.originalAmount,
      originalCurrency: d.originalCurrency,
    },
  };
}

/** Loads a saved split: shares that match the equal split stay automatic; otherwise every other person is fixed. */
function splitOf(c: Extract<Command, { type: 'EXPENSE' }>, tabName: (id: string) => string) {
  const split = c.split;
  if (!split) return { split: null, parties: [] as Party[], myShare: null };
  const blank = withPeople({ split: null, parties: [] as Party[] }, split.people);
  if (!split.parties) return { ...blank, myShare: null };
  const auto = shareMath(
    c.amount,
    split.parties.map(() => null),
    null,
  ).others;
  const same = split.parties.every((p, i) => p.share === auto[i]);
  return {
    split: split.people,
    myShare: null,
    parties: split.parties.map((p, i) => ({
      name: p.iouAccountId ? tabName(p.iouAccountId) : '',
      share: same ? null : p.share,
      tab: p.iouAccountId ?? null,
      tabName: p.iouAccountId ? tabName(p.iouAccountId) : '',
    })),
  };
}

export function fromCommand(c: Command, tabName: (id: string) => string = () => ''): Form {
  const f = { ...blankForm(c.date, c.type), amount: c.amount, note: c.note ?? '' };
  switch (c.type) {
    case 'EXPENSE':
      return {
        ...f,
        accountId: c.accountId,
        categoryId: c.categoryId,
        envelopeId: c.envelopeId ?? null,
        merchant: c.merchant ?? '',
        ...splitOf(c, tabName),
        iouAccountId: c.split?.iouAccountId ?? null,
        originalAmount: c.originalAmount ?? null,
        originalCurrency: c.originalCurrency ?? null,
      };
    case 'INCOME':
      return {
        ...f,
        accountId: c.accountId,
        categoryId: c.categoryId,
        envelopeId: c.envelopeId ?? null,
        merchant: c.merchant ?? '',
      };
    case 'TRANSFER':
      return { ...f, accountId: c.fromAccountId, toAccountId: c.toAccountId, fee: c.fee ?? null };
    case 'ALLOCATE':
      return { ...f, fromEnvelopeId: c.fromEnvelopeId, toEnvelopeId: c.toEnvelopeId };
  }
}

const opt = (s: string) => s.trim() || undefined;

/**
 * The split part of an expense. Everyone unnamed and equal is the plain head count (what quick add makes);
 * otherwise each other person is sent with their share, by tab when the name is unchanged, else by name.
 * No IOU account yet: the server creates "Friends" for unnamed shares.
 */
function splitCommand(f: Form): { split: SplitCmd | undefined } | { error: string } {
  if (!f.split || f.split < 2) return { split: undefined };
  const m = shareMath(
    f.amount,
    f.parties.map(p => p.share),
    f.myShare,
  );
  if (m.problem === 'mine') return { error: 'Your share must be more than zero' };
  if (m.problem) return { error: "The shares don't add up to the total" };
  const lump = f.iouAccountId ?? undefined;
  const plain = f.myShare === null && f.parties.every(p => !p.name.trim() && p.share === null);
  if (plain) return { split: { people: f.split, iouAccountId: lump } };
  return {
    split: {
      people: f.split,
      iouAccountId: lump,
      parties: f.parties.map((p, i) => {
        const name = p.name.trim();
        const who = p.tab && name === p.tabName ? { iouAccountId: p.tab } : name ? { name } : {};
        return { ...who, share: m.others[i] };
      }),
    },
  };
}
type SplitCmd = NonNullable<Extract<Command, { type: 'EXPENSE' }>['split']>;

/** The API command, or the first thing missing, in plain words. */
export function toCommand(f: Form): { command: Command } | { error: string } {
  if (!f.amount || f.amount <= 0) return { error: 'Enter an amount' };
  const base = { amount: f.amount, date: f.date, note: opt(f.note) };
  switch (f.type) {
    case 'EXPENSE':
    case 'INCOME': {
      if (!f.accountId) return { error: 'Pick an account' };
      if (!f.categoryId) return { error: 'Pick a category' };
      const common = {
        ...base,
        accountId: f.accountId,
        categoryId: f.categoryId,
        envelopeId: f.envelopeId ?? undefined,
        merchant: opt(f.merchant),
      };
      if (f.type === 'INCOME') return { command: { type: 'INCOME', ...common } };
      const split = splitCommand(f);
      if ('error' in split) return split;
      return {
        command: {
          type: 'EXPENSE',
          ...common,
          split: split.split,
          originalAmount: f.originalAmount ?? undefined,
          originalCurrency: f.originalCurrency ?? undefined,
        },
      };
    }
    case 'TRANSFER':
      if (!f.accountId) return { error: 'Pick where the money came from' };
      if (!f.toAccountId) return { error: 'Pick where the money went' };
      if (f.accountId === f.toAccountId) return { error: 'Pick two different accounts' };
      return {
        command: {
          type: 'TRANSFER',
          ...base,
          fromAccountId: f.accountId,
          toAccountId: f.toAccountId,
          fee: f.fee || undefined,
        },
      };
    case 'ALLOCATE':
      if (!f.fromEnvelopeId || !f.toEnvelopeId) return { error: 'Pick both pockets' };
      if (f.fromEnvelopeId === f.toEnvelopeId) return { error: 'Pick two different pockets' };
      return {
        command: {
          type: 'ALLOCATE',
          ...base,
          fromEnvelopeId: f.fromEnvelopeId,
          toEnvelopeId: f.toEnvelopeId,
        },
      };
  }
}

type ChipView =
  | { state: 'ready' }
  | { state: 'ask'; ask: 'charged' | 'amount' | 'account'; question: string }
  | { state: 'incomplete'; missing: string };

/** What the chip shows. Questions come one at a time, most important first. */
export function chipView(i: LogItem): ChipView {
  const f = i.form;
  if (i.askCharged && f.originalAmount !== null) {
    return {
      state: 'ask',
      ask: 'charged',
      question: `How much rupiah was charged for ${formatMoney(f.originalAmount, f.originalCurrency ?? 'USD')}?`,
    };
  }
  if (i.askAmount) return { state: 'ask', ask: 'amount', question: 'Which amount did you mean?' };
  if (f.type !== 'ALLOCATE' && !f.accountId)
    return { state: 'ask', ask: 'account', question: 'Which account?' };
  const r = toCommand(f);
  return 'error' in r ? { state: 'incomplete', missing: r.error } : { state: 'ready' };
}
