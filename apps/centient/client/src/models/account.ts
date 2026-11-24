// Accounts and pockets with their balances, and how a card's limit reads: what is left, how far over, what the
// limits box adds up. Pure apart from the queries and saves.
import { queryOptions } from '@tanstack/react-query';
import type { Account } from '../../../src/repos/accounts';
import { isCard } from '../../../src/domain/recurring';
import { idrValue } from '../lib/prices';
import { call, client, patchRow, type Req, type Res, type RowPatch } from './api';
import type { Prices } from './price';

/** Every account and pocket with its balance, in its own currency. */
export type Balances = Res<typeof client.api.balances.$get>;

export const accountQueries = {
  all: () => ['accounts'] as const,
  balances: () =>
    queryOptions({
      queryKey: [...accountQueries.all(), 'balances'],
      queryFn: () => call(client.api.balances.$get()),
    }),
};

type NewAccount = Req<typeof client.api.accounts.$post>['json'];

type CardDraft = { limit: number | null; days: unknown[]; used?: number };

/**
 * What a card / pay later still needs before it can save, else null: its limit and both bill days (without them it
 * has no bill), and no more used than the limit. Each screen says it in its own words.
 */
export function cardMissing(c: CardDraft): 'limit' | 'days' | 'used' | null {
  if (!c.limit) return 'limit';
  if (!c.days.every(Boolean)) return 'days';
  if ((c.used ?? 0) > c.limit) return 'used';
  return null;
}

const MISSING_WORDS = {
  limit: 'Enter the limit',
  days: 'Pick the bill days',
  used: 'More used than the limit',
} as const;

/** Why an account form can't save yet (its button says so), else null. */
export function cantSave(i: CardDraft & { name: string; card: boolean }) {
  if (!i.name.trim()) return 'Enter a name';
  const gap = i.card ? cardMissing(i) : null;
  return gap && MISSING_WORDS[gap];
}
type BalanceCheck = Req<(typeof client.api.accounts)[':id']['balance']['$post']>['json'];

/** Account saves (each refreshes everything: names, balances and entries all follow an account). */
export const accountApi = {
  create: (json: NewAccount) => call(client.api.accounts.$post({ json })),
  update: (id: string, json: RowPatch) => patchRow('accounts', id, json),
  remove: (id: string) => call(client.api.accounts[':id'].$delete({ param: { id } })),
  /** Records the bank's balance: an opening entry, a correction, or only "checked". */
  checkBalance: (id: string, json: BalanceCheck) =>
    call(client.api.accounts[':id'].balance.$post({ param: { id }, json })),
};

/** The kinds an account can have (the server checks them; the client offers ACCOUNT_KINDS' words). */
export type AccountKind = NonNullable<RowPatch['kind']>;
const KINDS = [
  'BANK',
  'DEBIT_CARD',
  'EWALLET',
  'CASH',
  'CREDIT_CARD',
  'PAYLATER',
  'EXCHANGE',
  'IOU',
] as const satisfies readonly AccountKind[];
/** A stored or picked kind as one the server takes; anything unknown reads as a bank account. */
export const toAccountKind = (k: string | null | undefined): AccountKind =>
  KINDS.find(x => x === k) ?? 'BANK';

/** An account with its balance, as the totals read it. */
export type Held = Pick<Account, 'currency_code' | 'kind'> & { balance: number };
type Limited = Pick<Account, 'kind' | 'credit_limit'> & { balance: number };

/** A card's / pay later's limit, or null (any other account, or a card from before limits were required). */
export const limitOf = (a: Pick<Account, 'kind' | 'credit_limit'>) =>
  isCard(a.kind) && a.credit_limit ? a.credit_limit : null;

/** What a card owes: its balance is its debt (below zero = owed). */
export const owedOn = (a: { balance: number }) => Math.max(0, -a.balance);

/**
 * What an account shows as its amount: a card / pay later with a limit shows what is left of it (limit − owed),
 * never below 0: past the limit it is Rp0 left and `overBy` says how far (owner, 2026-11-23).
 */
export const shownBalance = (a: Limited) => {
  const limit = limitOf(a);
  return limit ? Math.max(0, limit + a.balance) : a.balance;
};

/** How far a card / pay later is past its limit (banks let it happen: a purchase let through, interest, fees); 0 otherwise. */
export const overBy = (a: Limited) => {
  const limit = limitOf(a);
  return limit ? Math.max(0, -(limit + a.balance)) : 0;
};

/** Your money in rupiah (crypto at its last price), limits left out; `unpriced` = currencies with no rupiah price, kept apart. */
export function totalOf(accounts: Held[], p: Prices) {
  let total = 0,
    cryptoIdr = 0;
  const unpriced = new Map<string, number>();
  const priced = new Set<string>();
  for (const a of accounts.filter(a => !isCard(a.kind))) {
    const v = idrValue(a.balance, a.currency_code, p);
    if (v === null) unpriced.set(a.currency_code, (unpriced.get(a.currency_code) ?? 0) + a.balance);
    else {
      total += v;
      if (a.currency_code !== 'IDR') {
        cryptoIdr += v;
        priced.add(a.currency_code);
      }
    }
  }
  return { total, cryptoIdr, unpriced, priced };
}

const CARD_KINDS = [
  { kind: 'CREDIT_CARD', label: 'Credit card', many: 'credit cards' },
  { kind: 'PAYLATER', label: 'Pay later', many: 'pay later accounts' },
] as const;

/**
 * The limits box, per kind with an account (rupiah). Of the accounts with a limit: used (`owed`), limit, left (each
 * card stops at 0) and `over` (how far the ones past their limit are past it). The rest: how many (`unset`) and
 * what they owe.
 */
export function limitRows(
  accounts: (Held & Limited)[],
  idr: (minor: number, currency: string) => number,
) {
  return CARD_KINDS.flatMap(k => {
    const own = accounts.filter(a => a.kind === k.kind);
    if (!own.length) return [];
    const capped = own.filter(a => limitOf(a));
    const unset = own.filter(a => !limitOf(a));
    const sum = (xs: typeof own, f: (a: (typeof own)[number]) => number) =>
      xs.reduce((s, a) => s + idr(f(a), a.currency_code), 0);
    return [
      {
        ...k,
        count: own.length,
        owed: sum(capped, owedOn),
        limit: sum(capped, a => limitOf(a)!),
        left: sum(capped, shownBalance),
        over: sum(capped, overBy),
        unset: unset.length,
        unsetOwed: sum(unset, owedOn),
      },
    ];
  });
}
