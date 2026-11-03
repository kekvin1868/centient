// Accounts and pockets with their balances. (More of this domain moves here in its own step.)
import { queryOptions } from '@tanstack/react-query';
import { call, client, patchRow, type Req, type Res, type RowPatch } from './api';

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
