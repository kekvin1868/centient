// The form for one recurring bill: its fields, what stops saving, the request it makes, and how often it repeats.
import type { Recurring, RecurringBody } from './recurring';

type Every = RecurringBody['everyMonths'];
export const REPEATS: readonly { value: Every; label: string }[] = [
  { value: 1, label: 'Every month' },
  { value: 3, label: 'Every 3 months' },
  { value: 6, label: 'Every 6 months' },
  { value: 12, label: 'Every year' },
];
/** A stored or picked number of months as one the server takes; anything else reads as monthly. */
export const toEvery = (n: number): Every => REPEATS.find(r => r.value === n)?.value ?? 1;
export const repeatWords = (n: number) =>
  REPEATS.find(r => r.value === n)?.label ?? `Every ${n} months`;

export type RecurringForm = {
  name: string;
  /** Key of a known service (features/recurring/services), or null for a name typed by hand. */
  service: string | null;
  accountId: string | null;
  /** null = the account's Main pocket. */
  envelopeId: string | null;
  categoryId: string | null;
  amount: number | null;
  /** The amount changes each time (electricity): none is kept, and Mark paid asks for it. */
  varies: boolean;
  everyMonths: Every;
  nextDue: string;
  /** '' = no end. */
  endsOn: string;
};
/** What a new form may start with (a payment found in the entries already knows these). */
export type Prefill = Partial<
  Pick<RecurringForm, 'name' | 'accountId' | 'categoryId' | 'amount' | 'nextDue'>
>;

export const formFrom = (
  r: Recurring | null,
  today: string,
  prefill: Prefill = {},
): RecurringForm => ({
  name: r?.name ?? '',
  service: r?.service ?? null,
  accountId: r?.accountId ?? null,
  envelopeId: r?.envelopeId ?? null,
  categoryId: r?.categoryId ?? null,
  amount: r?.amount ?? null,
  varies: r ? r.amount === null : false,
  everyMonths: toEvery(r?.everyMonths ?? 1),
  nextDue: r?.nextDue ?? today,
  endsOn: r?.endsOn ?? '',
  ...prefill,
});

/** What stops saving, in the words the Save button shows; null when it can be saved. */
export function validate(f: RecurringForm): string | null {
  if (!f.name.trim()) return 'Give it a name';
  if (!f.accountId) return 'Pick where it is paid from';
  if (!f.categoryId) return 'Pick a category';
  if (!f.varies && !f.amount) return 'Enter the amount';
  if (f.endsOn && f.endsOn < f.nextDue) return 'It ends before it is next due';
  return null;
}

/** The body for a new bill or an edit; call only once `validate` passes. */
export const toRequest = (f: RecurringForm): RecurringBody => ({
  name: f.name.trim(),
  service: f.service,
  accountId: f.accountId!,
  envelopeId: f.envelopeId,
  categoryId: f.categoryId!,
  amount: f.varies ? null : f.amount,
  everyMonths: f.everyMonths,
  nextDue: f.nextDue,
  endsOn: f.endsOn || null,
});
