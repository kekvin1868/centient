// Budgets: what the API sends, how they load and save, the budget form, and how a row reads on screen.
// The Budget forecast's wording and the device setting for when it starts live in ./forecast.
import { queryOptions, useMutation } from '@tanstack/react-query';
import { pocketLabel } from '../lib/labels';
import { nameOf, type Catalog } from '../lib/state';
import { call, client, type Req, type Res } from './api';

type Status = Res<typeof client.api.budgets.$get>;
/** One budget with its spending this cycle (or its own dates) and the forecast fields. */
export type Budget = Status['budgets'][number];
/** The running cycle: `to` is excluded. */
export type BudgetCycle = Status['cycle'];
/** A temporary budget that ran to its end. */
export type EndedBudget = Res<typeof client.api.budgets.history.$get>[number];
export type SavingsQuery = NonNullable<Req<typeof client.api.budgets.savings.$get>['query']>;
type SaveBody = Req<typeof client.api.budgets.$put>['json'];

export const budgetQueries = {
  all: () => ['budgets'] as const,
  status: () =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'status'],
      queryFn: () => call(client.api.budgets.$get({ query: {} })),
    }),
  history: () =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'history'],
      queryFn: () => call(client.api.budgets.history.$get()),
    }),
  savings: (query: SavingsQuery) =>
    queryOptions({
      queryKey: [...budgetQueries.all(), 'savings', query],
      queryFn: () => call(client.api.budgets.savings.$get({ query })),
    }),
};

type OnError = (e: Error & { code?: string }) => void;

/** Sets or changes a budget. Pass `onError` to handle a refusal yourself (else it shows as a toast). */
export const useSaveBudget = (onError?: OnError) =>
  useMutation({
    mutationFn: (json: SaveBody) => call(client.api.budgets.$put({ json })),
    meta: { invalidates: [budgetQueries.all()] },
    onError,
  });

export const useRemoveBudget = () =>
  useMutation({
    mutationFn: (id: string) => call(client.api.budgets[':id'].$delete({ param: { id } })),
    meta: { invalidates: [budgetQueries.all()] },
  });

// ---- The budget form ----

/** A temporary budget runs 2 to 90 days; a new one offers 14. */
export const TEMPORARY_DAYS = { min: 2, max: 90, first: 14 } as const;

export type BudgetForm = {
  categoryId: string | null;
  envelopeId: string | null;
  limit: number | null;
  /** Picked for a category-only budget; a pocket's budget is in the pocket's currency. */
  currency: string;
  temporary: boolean;
  startsOn: string;
  days: number;
};

export const formFrom = (b: Budget | null, today: string): BudgetForm => ({
  categoryId: b?.categoryId ?? null,
  envelopeId: b?.envelopeId ?? null,
  limit: b?.limit ?? null,
  currency: b?.currency ?? 'IDR',
  temporary: Boolean(b?.startsOn),
  startsOn: b?.startsOn ?? today,
  days: b?.startsOn ? b.cycleDays : TEMPORARY_DAYS.first,
});

/** The currency the budget is kept in: its own once saved, else a pocket's own, else the one picked. */
export const formCurrency = (f: BudgetForm, editing: boolean, pocketCurrency?: string) =>
  editing ? f.currency : (pocketCurrency ?? f.currency);

/** What stops saving, in the words the Save button shows; null when it can be saved. */
export function validate(f: BudgetForm, o: { editing: boolean; today: string }): string | null {
  if (!f.categoryId && !f.envelopeId) return 'Pick a category or a pocket';
  if (!f.limit) return 'Enter a limit';
  if (f.temporary && !o.editing && f.startsOn < o.today) return 'Start today or later';
  return null;
}

/** The PUT body. `id` changes an existing temporary budget (a cycle budget is matched by its target). */
export const toRequest = (f: BudgetForm, currency: string, id?: string): SaveBody => ({
  categoryId: f.categoryId,
  envelopeId: f.envelopeId,
  currency,
  limit: f.limit!,
  ...(f.temporary ? { startsOn: f.startsOn, days: f.days, id } : {}),
});

// ---- How budgets read on screen ----

/** "Food & Drink in BCA · Rent": the category, the pocket, or both. */
export const budgetName = (
  b: { categoryId: string | null; envelopeId: string | null },
  cat: Catalog,
) =>
  [b.categoryId && nameOf(cat.categories, b.categoryId), b.envelopeId && pocketLabel(b.envelopeId)]
    .filter(Boolean)
    .join(' in ');

/** The currencies to group by: rupiah first, then by code; rupiah alone when there are no budgets. */
export function budgetCurrencies(budgets: { currency: string }[]): string[] {
  const codes = [...new Set(budgets.map(b => b.currency))].sort((a, b) =>
    a === 'IDR' ? -1 : b === 'IDR' ? 1 : a.localeCompare(b),
  );
  return codes.length ? codes : ['IDR'];
}

/** One currency's budgets: cycle budgets first, then temporary ones. */
export const budgetsIn = (budgets: Budget[], currency: string) =>
  budgets
    .filter(b => b.currency === currency)
    .sort((x, y) => Number(Boolean(x.startsOn)) - Number(Boolean(y.startsOn)));
