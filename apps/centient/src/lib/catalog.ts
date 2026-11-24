// The workspace's accounts, pockets and categories, loaded once per request, with lookups that throw
// NOT_FOUND for ids from another workspace (the ownership check every service relies on).
import {
  ADJUSTMENT_CATEGORY,
  DomainError,
  FEES_CATEGORY,
  OPENING_CATEGORY,
  type AccountRef,
  type EnvelopeRef,
} from '../domain/ledger';
import type { Repos } from '../middleware/init';
import type { Account } from '../repos/accounts';
import type { Category } from '../repos/categories';
import type { Envelope } from '../repos/envelopes';

export type Catalog = ReturnType<typeof createCatalog>;
export type Snapshot = ReturnType<typeof snapshotOf>;

/** Caches the snapshot for this request; services that change accounts, pockets or categories call invalidate(). */
export function createCatalog(ws: string, repos: Repos) {
  let cached: Promise<Snapshot> | null = null;
  return {
    load: () => (cached ??= read(ws, repos)),
    invalidate() {
      cached = null;
    },
  };
}

async function read(ws: string, repos: Repos) {
  const [accounts, envelopes, categories] = await Promise.all([
    repos.accounts.list(ws),
    repos.envelopes.list(ws),
    repos.categories.list(ws),
  ]);
  return snapshotOf(accounts, envelopes, categories);
}

/** The lookups over rows already in hand. Pure: the web app makes one from its own copy of the catalog. */
export function snapshotOf(accounts: Account[], envelopes: Envelope[], categories: Category[]) {
  const find = <T extends { id: string }>(rows: T[], id: string | undefined, what: string): T => {
    const row = rows.find(r => r.id === id);
    if (!row) throw new DomainError('NOT_FOUND', `${what} not found`);
    return row;
  };
  /** A category the app finds by name; refused with `code` when the person deleted it. */
  const builtIn = (name: string, kind: Category['kind'], code: string): Category => {
    const c = categories.find(x => x.name === name && x.kind === kind);
    if (!c) throw new DomainError(code, `Create a "${name}" ${kind.toLowerCase()} category first`);
    return c;
  };
  return {
    accounts,
    envelopes,
    categories,
    account: (id?: string): AccountRef & { row: Account } => {
      const a = find(accounts, id, 'Account');
      return { id: a.id, currency: a.currency_code, row: a };
    },
    envelope: (id?: string): EnvelopeRef => {
      const e = find(envelopes, id, 'Pocket');
      return { id: e.id, currency: e.currency_code, kind: e.kind, accountId: e.account_id };
    },
    category: (id: string | undefined, kind: Category['kind']): Category => {
      const c = find(categories, id, 'Category');
      if (c.kind !== kind)
        throw new DomainError(
          'WRONG_CATEGORY_KIND',
          `${c.name} is an ${c.kind.toLowerCase()} category`,
        );
      return c;
    },
    categoryByName: (name: string) => categories.find(c => c.name === name),
    /** Fees & Interests: transfer fees, plan interest and interest typed from a card's statement. */
    fees: () => builtIn(FEES_CATEGORY, 'EXPENSE', 'NO_FEES_CATEGORY'),
    /** Opening balance: an account's first balance. */
    opening: () => builtIn(OPENING_CATEGORY, 'INCOME', 'NO_OPENING_CATEGORY'),
    /** Balance adjustment: a correction with no category, which budgets ignore. */
    adjustment: () => builtIn(ADJUSTMENT_CATEGORY, 'INCOME', 'NO_ADJUSTMENT_CATEGORY'),
    /** The account's Main pocket (its default), else its first pocket. Every account is created with one. */
    defaultEnvelope(account: Account): EnvelopeRef {
      const e =
        envelopes.find(x => x.id === account.default_envelope_id) ??
        envelopes.find(x => x.account_id === account.id);
      if (!e) throw new DomainError('NO_ENVELOPE', `${account.name} has no pocket`);
      return { id: e.id, currency: e.currency_code, kind: e.kind, accountId: e.account_id };
    },
    /** The pocket the command named, else the account's Main pocket. */
    pocketOf(account: Account, id?: string): EnvelopeRef {
      return id ? this.envelope(id) : this.defaultEnvelope(account);
    },
    /** Which account a pocket belongs to (for the balance check). */
    accountOf(pocketId: string): string {
      return envelopes.find(e => e.id === pocketId)?.account_id ?? '?';
    },
  };
}
