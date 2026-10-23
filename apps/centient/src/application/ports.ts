// Ports: what the use cases need from storage. D1 implements them in infrastructure/.
import type { NewTransaction } from '../domain/ledger';

export type Workspace = { id: string; name: string; cycle_start_day: number; onboarded_at: string | null };
export type Account = {
  id: string; name: string; kind: string; provider: string | null; currency_code: string;
  default_envelope_id: string | null; due_day: number | null; reconciled_at: string | null; archived_at: string | null;
};
/** A pocket: part of one account's money (the account's balance is the sum of its pockets). */
export type Envelope = {
  id: string; account_id: string; name: string; currency_code: string; kind: 'SPENDING' | 'SAVINGS' | 'GOAL';
  target_amount: number | null; target_date: string | null; archived_at: string | null;
  /** Hex color the user picked for the pocket's card; null = the default for its place. */
  color: string | null;
  /** Which card pattern (0-23); unique among an account's live pockets. */
  pattern: number;
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
/** One thing the user logged: a group of transactions edited and deleted together. */
export type EntryKind = 'USER' | 'OPENING' | 'CORRECTION';
export type EntryView = {
  id: string; kind: EntryKind; occurred_at: string;
  /** The saved command (JSON), or null for system entries and rows from before entry groups. */
  command: unknown | null;
  /** Emoji for the entry: its own, else the one remembered for its merchant; null = the category's. */
  icon: string | null;
  transactions: TxView[];
};
export type NewEntry = { kind: EntryKind; command: unknown | null; txs: NewTransaction[] };

export type TxFilter = {
  from?: string; to?: string; accountId?: string; envelopeId?: string; categoryId?: string; type?: string;
  cursor?: string; limit: number;
};

export interface CatalogRepository {
  /** Finds the user's workspace, creating user, workspace and seed data on first sign-in. */
  ensureWorkspace(email: string): Promise<{ userId: string; workspaceId: string }>;
  getWorkspace(ws: string): Promise<Workspace>;
  updateWorkspace(ws: string, patch: { name?: string; cycle_start_day?: number; onboarded_at?: string }): Promise<void>;
  listAccounts(ws: string): Promise<Account[]>;
  listEnvelopes(ws: string): Promise<Envelope[]>;
  listCategories(ws: string): Promise<Category[]>;
  /** Creates the account with its Main pocket (the account's default). */
  createAccount(ws: string, a: Omit<Account, 'id' | 'reconciled_at' | 'archived_at' | 'default_envelope_id'>): Promise<Account>;
  createEnvelope(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>): Promise<Envelope>;
  createCategory(ws: string, c: Omit<Category, 'id' | 'archived_at'>): Promise<Category>;
  /** Patches only whitelisted columns; returns false when the row is not in this workspace. */
  update(ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>): Promise<boolean>;
  listAliases(ws: string): Promise<Alias[]>;
  saveAlias(ws: string, a: Alias): Promise<void>;
  listBudgets(ws: string): Promise<Budget[]>;
  setBudget(ws: string, target: { categoryId: string | null; envelopeId: string | null }, amount: number, effectiveFrom: string): Promise<string>;
  deleteBudget(ws: string, id: string): Promise<boolean>;
  /** Soft-deletes the account and every entry that touches it; false when it is not in this workspace. */
  deleteAccount(ws: string, id: string, now: string): Promise<boolean>;
  /** Moves everything in a category to another, then soft-deletes it; false when it is not in this workspace. */
  deleteCategory(ws: string, id: string, moveTo: string, now: string): Promise<boolean>;
  /** Soft-deletes the whole workspace; the user's next request gets a fresh one. */
  resetWorkspace(ws: string, now: string): Promise<void>;
}

export interface LedgerRepository {
  /** Writes every entry, its transactions and their lines in one atomic batch; returns the entry ids. */
  insert(ws: string, entries: NewEntry[]): Promise<string[]>;
  /** Replaces an entry's transactions and saved command in one atomic batch. */
  replace(ws: string, entryId: string, command: unknown, txs: NewTransaction[]): Promise<void>;
  getEntry(ws: string, id: string): Promise<EntryView | null>;
  /** Soft-deletes the entry and all its transactions; false when it is not in this workspace. */
  deleteEntry(ws: string, id: string): Promise<boolean>;
  /** One item per entry, newest first; a filter matches when any of its transactions matches. */
  listEntries(ws: string, f: TxFilter): Promise<{ items: EntryView[]; nextCursor: string | null }>;
  hasTransactions(ws: string, accountId: string): Promise<boolean>;
  list(ws: string, f: TxFilter): Promise<{ items: TxView[]; nextCursor: string | null }>;
  balances(ws: string): Promise<{ accounts: Record<string, number>; envelopes: Record<string, number> }>;
  /** IDR spent in [from, to) on EXPENSE allocations matching the category and/or envelope. */
  spent(ws: string, q: { categoryId: string | null; envelopeId: string | null; from: string; to: string }): Promise<number>;
  merchantHistory(ws: string): Promise<Record<string, { min: number; max: number; categoryId: string | null }>>;
  lastAccountId(ws: string): Promise<string | null>;
  /** Sets (or clears, null) an entry's icon; with `merchant`, also remembers it for that merchant. */
  setIcon(ws: string, entryId: string, icon: string | null, merchant: string | null): Promise<boolean>;
}

/** Last known rupiah price of one whole coin per currency (global, not per workspace). */
export type Price = { currency_code: string; idr_per_unit: number; fetched_at: string };
export interface PriceRepository {
  get(codes: string[]): Promise<Price[]>;
  save(prices: Price[]): Promise<void>;
}

/** An installment plan on a pay later / credit card account, with who owes what and which shares are paid. */
export type PlanRow = {
  id: string; account_id: string; name: string; amount_per_installment: number; installments: number; first_due: string; created_at: string;
};
export type PartyRow = { plan_id: string; seq: number; name: string; iou_account_id: string | null; share: number };
export type PaymentRow = {
  plan_id: string; installment_no: number; party_seq: number; paid_at: string; entry_id: string | null;
  proof: { id: string; filename: string; content_type: string } | null;
};
export type Attachment = { id: string; r2_key: string; filename: string; content_type: string; size: number };

export interface InstallmentRepository {
  createPlan(ws: string, plan: Omit<PlanRow, 'created_at'>, parties: PartyRow[], prepaid: Omit<PaymentRow, 'proof'>[]): Promise<void>;
  /** Live plans (optionally of one account) with their parties and paid shares. A share whose logged entry was deleted counts as unpaid. */
  listPlans(ws: string, accountId?: string): Promise<{ plans: PlanRow[]; parties: PartyRow[]; payments: PaymentRow[] }>;
  addPayment(ws: string, p: Omit<PaymentRow, 'proof'>): Promise<void>;
  /** Removes a paid share; returns its logged entry id (or null), or undefined when there was none. */
  deletePayment(ws: string, planId: string, no: number, seq: number): Promise<string | null | undefined>;
  setProof(ws: string, planId: string, no: number, seq: number, attachmentId: string | null): Promise<boolean>;
  deletePlan(ws: string, id: string): Promise<boolean>;
  createAttachment(ws: string, a: Attachment): Promise<void>;
  getAttachment(ws: string, id: string): Promise<Attachment | null>;
}

/** Private file storage (R2 in production and dev). */
export interface FileStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null>;
}
