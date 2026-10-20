// Ports: what the use cases need from storage. D1 implements them in infrastructure/.
import type { NewTransaction } from '../domain/ledger';

export type Workspace = { id: string; name: string; cycle_start_day: number };
export type Account = {
  id: string; name: string; kind: string; provider: string | null; currency_code: string;
  default_envelope_id: string | null; due_day: number | null; reconciled_at: string | null; archived_at: string | null;
};
export type Envelope = {
  id: string; name: string; currency_code: string; kind: 'SPENDING' | 'SAVINGS' | 'GOAL';
  target_amount: number | null; target_date: string | null; archived_at: string | null;
};
export type Category = { id: string; name: string; kind: 'EXPENSE' | 'INCOME'; archived_at: string | null };
export type Alias = { alias: string; kind: 'MERCHANT' | 'ACCOUNT' | 'CATEGORY'; value: string };
export type Budget = {
  id: string; category_id: string | null; envelope_id: string | null;
  limits: { effective_from: string; amount: number }[];
};

export type TxView = {
  id: string; type: string; occurred_at: string; category_id: string | null; merchant: string | null; note: string | null;
  original_amount: number | null; original_currency: string | null;
  entries: { account_id: string; amount: number }[];
  allocations: { envelope_id: string; amount: number }[];
};
export type TxFilter = {
  from?: string; to?: string; accountId?: string; envelopeId?: string; categoryId?: string; type?: string;
  cursor?: string; limit: number;
};

export interface CatalogRepository {
  /** Finds the user's workspace, creating user, workspace and seed data on first sign-in. */
  ensureWorkspace(email: string): Promise<{ userId: string; workspaceId: string }>;
  getWorkspace(ws: string): Promise<Workspace>;
  updateWorkspace(ws: string, patch: { name?: string; cycle_start_day?: number }): Promise<void>;
  listAccounts(ws: string): Promise<Account[]>;
  listEnvelopes(ws: string): Promise<Envelope[]>;
  listCategories(ws: string): Promise<Category[]>;
  createAccount(ws: string, a: Omit<Account, 'id' | 'reconciled_at' | 'archived_at'>): Promise<Account>;
  createEnvelope(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>): Promise<Envelope>;
  createCategory(ws: string, c: Omit<Category, 'id' | 'archived_at'>): Promise<Category>;
  /** Patches only whitelisted columns; returns false when the row is not in this workspace. */
  update(ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>): Promise<boolean>;
  listAliases(ws: string): Promise<Alias[]>;
  saveAlias(ws: string, a: Alias): Promise<void>;
  listBudgets(ws: string): Promise<Budget[]>;
  setBudget(ws: string, target: { categoryId: string | null; envelopeId: string | null }, amount: number, effectiveFrom: string): Promise<string>;
  deleteBudget(ws: string, id: string): Promise<boolean>;
}

export interface LedgerRepository {
  /** Writes all transactions and their lines in one atomic batch. */
  insert(ws: string, txs: NewTransaction[]): Promise<string[]>;
  softDelete(ws: string, id: string): Promise<boolean>;
  list(ws: string, f: TxFilter): Promise<{ items: TxView[]; nextCursor: string | null }>;
  balances(ws: string): Promise<{ accounts: Record<string, number>; envelopes: Record<string, number> }>;
  /** IDR spent in [from, to) on EXPENSE allocations matching the category and/or envelope. */
  spent(ws: string, q: { categoryId: string | null; envelopeId: string | null; from: string; to: string }): Promise<number>;
  merchantHistory(ws: string): Promise<Record<string, { min: number; max: number; categoryId: string | null }>>;
  lastAccountId(ws: string): Promise<string | null>;
}
