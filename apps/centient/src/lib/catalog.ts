// The workspace's accounts, pockets and categories, loaded once per request, with lookups that throw
// NOT_FOUND for ids from another workspace (the ownership check every service relies on).
import { DomainError, type AccountRef, type EnvelopeRef } from '../domain/ledger';
import type { Repos } from '../middleware/init';
import type { Account } from '../repos/accounts';
import type { Category } from '../repos/categories';

export type Catalog = ReturnType<typeof createCatalog>;
export type Snapshot = Awaited<ReturnType<typeof read>>;

/** Caches the snapshot for this request; services that change accounts, pockets or categories call invalidate(). */
export function createCatalog(ws: string, repos: Repos) {
  let cached: Promise<Snapshot> | null = null;
  return {
    load: () => (cached ??= read(ws, repos)),
    invalidate() { cached = null; },
  };
}

async function read(ws: string, repos: Repos) {
  const [accounts, envelopes, categories] = await Promise.all([
    repos.accounts.list(ws), repos.envelopes.list(ws), repos.categories.list(ws),
  ]);
  const find = <T extends { id: string }>(rows: T[], id: string | undefined, what: string): T => {
    const row = rows.find(r => r.id === id);
    if (!row) throw new DomainError('NOT_FOUND', `${what} not found`);
    return row;
  };
  return {
    accounts, envelopes, categories,
    account: (id?: string): AccountRef & { row: Account } => { const a = find(accounts, id, 'Account'); return { id: a.id, currency: a.currency_code, row: a }; },
    envelope: (id?: string): EnvelopeRef => { const e = find(envelopes, id, 'Pocket'); return { id: e.id, currency: e.currency_code, kind: e.kind, accountId: e.account_id }; },
    category: (id: string | undefined, kind: Category['kind']): Category => {
      const c = find(categories, id, 'Category');
      if (c.kind !== kind) throw new DomainError('WRONG_CATEGORY_KIND', `${c.name} is an ${c.kind.toLowerCase()} category`);
      return c;
    },
    categoryByName: (name: string) => categories.find(c => c.name === name),
    /** The account's Main pocket (its default), else its first pocket. Every account is created with one. */
    defaultEnvelope(account: Account): EnvelopeRef {
      const e = envelopes.find(x => x.id === account.default_envelope_id) ?? envelopes.find(x => x.account_id === account.id);
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
