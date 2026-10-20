// D1 adapters for the ports. Every query filters on workspace_id: D1 has no row-level
// security, so this is the wall between workspaces.
import type { NewTransaction } from '../domain/ledger';
import type {
  Account, Alias, Budget, CatalogRepository, Category, Envelope, LedgerRepository, TxFilter, TxView, Workspace,
} from '../application/ports';

const uid = () => crypto.randomUUID();

const SEED_EXPENSE = ['Food & Drink', 'Coffee', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing',
  'Health', 'Entertainment', 'Education', 'Giving', 'Kondangan', 'Family', 'Fees', 'Balance adjustment', 'Other'];
const SEED_INCOME = ['Salary', 'Angpao & THR', 'Interest & cashback', 'Opening balance', 'Other income'];

/** Columns a PATCH may touch, per table. Anything else in the request is ignored. */
const PATCHABLE: Record<string, string[]> = {
  accounts: ['name', 'provider', 'default_envelope_id', 'due_day', 'archived_at'],
  envelopes: ['name', 'target_amount', 'target_date', 'archived_at'],
  categories: ['name', 'archived_at'],
};

export class D1Catalog implements CatalogRepository {
  constructor(private db: D1Database) {}

  async ensureWorkspace(email: string) {
    await this.db.prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)').bind(uid(), email.toLowerCase()).run();
    const user = await this.db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: string }>();
    const userId = user!.id;
    const member = await this.db.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ? LIMIT 1').bind(userId).first<{ workspace_id: string }>();
    if (member) return { userId, workspaceId: member.workspace_id };

    // ponytail: two first requests at the same instant could seed two workspaces; harmless for one user.
    const ws = uid();
    const monthly = uid();
    const s = (sql: string, ...v: unknown[]) => this.db.prepare(sql).bind(...v);
    await this.db.batch([
      s('INSERT INTO workspaces (id, name) VALUES (?, ?)', ws, 'My money'),
      s("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'OWNER')", ws, userId),
      s("INSERT INTO envelopes (id, workspace_id, name, kind) VALUES (?, ?, 'Monthly', 'SPENDING')", monthly, ws),
      s("INSERT INTO envelopes (id, workspace_id, name, kind) VALUES (?, ?, 'Savings', 'SAVINGS')", uid(), ws),
      s("INSERT INTO accounts (id, workspace_id, name, kind) VALUES (?, ?, 'Friends', 'IOU')", uid(), ws),
      ...SEED_EXPENSE.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'EXPENSE')", uid(), ws, n)),
      ...SEED_INCOME.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'INCOME')", uid(), ws, n)),
    ]);
    return { userId, workspaceId: ws };
  }

  async getWorkspace(ws: string) {
    return (await this.db.prepare('SELECT id, name, cycle_start_day FROM workspaces WHERE id = ?').bind(ws).first<Workspace>())!;
  }

  async updateWorkspace(ws: string, patch: { name?: string; cycle_start_day?: number }) {
    await this.db.prepare('UPDATE workspaces SET name = COALESCE(?, name), cycle_start_day = COALESCE(?, cycle_start_day) WHERE id = ?')
      .bind(patch.name ?? null, patch.cycle_start_day ?? null, ws).run();
  }

  private async all<T>(sql: string, ws: string) {
    return (await this.db.prepare(sql).bind(ws).all<T>()).results;
  }
  listAccounts(ws: string) { return this.all<Account>('SELECT id, name, kind, provider, currency_code, default_envelope_id, due_day, reconciled_at, archived_at FROM accounts WHERE workspace_id = ? ORDER BY name', ws); }
  listEnvelopes(ws: string) { return this.all<Envelope>('SELECT id, name, currency_code, kind, target_amount, target_date, archived_at FROM envelopes WHERE workspace_id = ? ORDER BY name', ws); }
  listCategories(ws: string) { return this.all<Category>('SELECT id, name, kind, archived_at FROM categories WHERE workspace_id = ? ORDER BY kind, name', ws); }

  async createAccount(ws: string, a: Omit<Account, 'id' | 'reconciled_at' | 'archived_at'>) {
    const id = uid();
    await this.db.prepare('INSERT INTO accounts (id, workspace_id, name, kind, provider, currency_code, default_envelope_id, due_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ws, a.name, a.kind, a.provider, a.currency_code, a.default_envelope_id, a.due_day).run();
    return { ...a, id, reconciled_at: null, archived_at: null };
  }

  async createEnvelope(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>) {
    const id = uid();
    await this.db.prepare('INSERT INTO envelopes (id, workspace_id, name, currency_code, kind, target_amount, target_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ws, e.name, e.currency_code, e.kind, e.target_amount, e.target_date).run();
    return { ...e, id, archived_at: null };
  }

  async createCategory(ws: string, c: Omit<Category, 'id' | 'archived_at'>) {
    const id = uid();
    await this.db.prepare('INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, ?)').bind(id, ws, c.name, c.kind).run();
    return { ...c, id, archived_at: null };
  }

  async update(ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch).filter(k => PATCHABLE[table].includes(k));
    if (!cols.length) return true;
    const r = await this.db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND workspace_id = ?`)
      .bind(...cols.map(c => patch[c] ?? null), id, ws).run();
    return r.meta.changes > 0;
  }

  listAliases(ws: string) { return this.all<Alias>('SELECT alias, kind, value FROM aliases WHERE workspace_id = ?', ws); }

  async saveAlias(ws: string, a: Alias) {
    await this.db.prepare('INSERT INTO aliases (workspace_id, alias, kind, value) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id, alias, kind) DO UPDATE SET value = excluded.value')
      .bind(ws, a.alias, a.kind, a.value).run();
  }

  async listBudgets(ws: string): Promise<Budget[]> {
    const budgets = await this.all<Omit<Budget, 'limits'>>('SELECT id, category_id, envelope_id FROM budgets WHERE workspace_id = ? AND deleted_at IS NULL', ws);
    const limits = await this.all<{ budget_id: string; effective_from: string; amount: number }>(
      'SELECT l.budget_id, l.effective_from, l.amount FROM budget_limits l JOIN budgets b ON b.id = l.budget_id WHERE b.workspace_id = ? AND b.deleted_at IS NULL', ws);
    return budgets.map(b => ({ ...b, limits: limits.filter(l => l.budget_id === b.id) }));
  }

  async setBudget(ws: string, t: { categoryId: string | null; envelopeId: string | null }, amount: number, effectiveFrom: string) {
    const found = await this.db.prepare("SELECT id FROM budgets WHERE workspace_id = ? AND IFNULL(category_id, '') = ? AND IFNULL(envelope_id, '') = ? AND deleted_at IS NULL")
      .bind(ws, t.categoryId ?? '', t.envelopeId ?? '').first<{ id: string }>();
    const id = found?.id ?? uid();
    const stmts = [];
    if (!found) stmts.push(this.db.prepare('INSERT INTO budgets (id, workspace_id, category_id, envelope_id) VALUES (?, ?, ?, ?)').bind(id, ws, t.categoryId, t.envelopeId));
    // A new limit takes effect from the current cycle; past cycles keep theirs, so savings history stays true.
    stmts.push(this.db.prepare('INSERT INTO budget_limits (budget_id, effective_from, amount) VALUES (?, ?, ?) ON CONFLICT (budget_id, effective_from) DO UPDATE SET amount = excluded.amount')
      .bind(id, effectiveFrom, amount));
    await this.db.batch(stmts);
    return id;
  }

  async deleteBudget(ws: string, id: string) {
    const r = await this.db.prepare("UPDATE budgets SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
    return r.meta.changes > 0;
  }
}

export class D1Ledger implements LedgerRepository {
  constructor(private db: D1Database) {}

  async insert(ws: string, txs: NewTransaction[]) {
    const ids: string[] = [];
    const stmts: D1PreparedStatement[] = [];
    for (const t of txs) {
      const id = uid();
      ids.push(id);
      stmts.push(this.db.prepare('INSERT INTO transactions (id, workspace_id, type, occurred_at, category_id, merchant, note, original_amount, original_currency, spread_cycles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ws, t.type, t.occurredAt, t.categoryId, t.merchant, t.note, t.originalAmount ?? null, t.originalCurrency ?? null, t.spreadCycles ?? 1));
      for (const e of t.entries) stmts.push(this.db.prepare('INSERT INTO entries (transaction_id, account_id, amount) VALUES (?, ?, ?)').bind(id, e.accountId, e.amount));
      for (const a of t.allocations) stmts.push(this.db.prepare('INSERT INTO allocations (transaction_id, envelope_id, amount) VALUES (?, ?, ?)').bind(id, a.envelopeId, a.amount));
    }
    await this.db.batch(stmts); // one batch = one atomic write
    return ids;
  }

  async softDelete(ws: string, id: string) {
    const r = await this.db.prepare("UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
      .bind(id, ws).run();
    return r.meta.changes > 0;
  }

  async list(ws: string, f: TxFilter) {
    const where = ['t.workspace_id = ?', 't.deleted_at IS NULL'];
    const args: unknown[] = [ws];
    if (f.from) { where.push('substr(t.occurred_at, 1, 10) >= ?'); args.push(f.from); }
    if (f.to) { where.push('substr(t.occurred_at, 1, 10) <= ?'); args.push(f.to); }
    if (f.type) { where.push('t.type = ?'); args.push(f.type); }
    if (f.categoryId) { where.push('t.category_id = ?'); args.push(f.categoryId); }
    if (f.accountId) { where.push('EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = t.id AND e.account_id = ?)'); args.push(f.accountId); }
    if (f.envelopeId) { where.push('EXISTS (SELECT 1 FROM allocations a WHERE a.transaction_id = t.id AND a.envelope_id = ?)'); args.push(f.envelopeId); }
    if (f.cursor) {
      const [at, id] = f.cursor.split('|');
      where.push('(t.occurred_at, t.id) < (?, ?)'); args.push(at, id);
    }
    const rows = (await this.db.prepare(`SELECT t.id, t.type, t.occurred_at, t.category_id, t.merchant, t.note, t.original_amount, t.original_currency
      FROM transactions t WHERE ${where.join(' AND ')} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ?`).bind(...args, f.limit + 1)
      .all<Omit<TxView, 'entries' | 'allocations'>>()).results;
    const page = rows.slice(0, f.limit);
    const ids = JSON.stringify(page.map(r => r.id));
    // json_each keeps the bound-parameter count at one, whatever the page size.
    const [entries, allocations] = await this.db.batch<{ transaction_id: string; account_id?: string; envelope_id?: string; amount: number }>([
      this.db.prepare('SELECT transaction_id, account_id, amount FROM entries WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
      this.db.prepare('SELECT transaction_id, envelope_id, amount FROM allocations WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
    ]);
    const items = page.map(r => ({
      ...r,
      entries: entries.results.filter(e => e.transaction_id === r.id).map(e => ({ account_id: e.account_id!, amount: e.amount })),
      allocations: allocations.results.filter(a => a.transaction_id === r.id).map(a => ({ envelope_id: a.envelope_id!, amount: a.amount })),
    }));
    const last = page.at(-1);
    return { items, nextCursor: rows.length > f.limit && last ? `${last.occurred_at}|${last.id}` : null };
  }

  async balances(ws: string) {
    const [acc, env] = await this.db.batch<{ id: string; balance: number }>([
      this.db.prepare('SELECT e.account_id AS id, SUM(e.amount) AS balance FROM entries e JOIN transactions t ON t.id = e.transaction_id WHERE t.workspace_id = ? AND t.deleted_at IS NULL GROUP BY e.account_id').bind(ws),
      this.db.prepare('SELECT a.envelope_id AS id, SUM(a.amount) AS balance FROM allocations a JOIN transactions t ON t.id = a.transaction_id WHERE t.workspace_id = ? AND t.deleted_at IS NULL GROUP BY a.envelope_id').bind(ws),
    ]);
    const map = (rows: { id: string; balance: number }[]) => Object.fromEntries(rows.map(r => [r.id, r.balance]));
    return { accounts: map(acc.results), envelopes: map(env.results) };
  }

  async spent(ws: string, q: { categoryId: string | null; envelopeId: string | null; from: string; to: string }) {
    // ponytail: spread_cycles (0% instalments) not applied yet; the full amount counts in the purchase cycle.
    const r = await this.db.prepare(`SELECT COALESCE(SUM(-a.amount), 0) AS spent
      FROM transactions t JOIN allocations a ON a.transaction_id = t.id JOIN envelopes e ON e.id = a.envelope_id AND e.currency_code = 'IDR'
      WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE'
        AND substr(t.occurred_at, 1, 10) >= ? AND substr(t.occurred_at, 1, 10) < ?
        AND (? IS NULL OR t.category_id = ?) AND (? IS NULL OR a.envelope_id = ?)`)
      .bind(ws, q.from, q.to, q.categoryId, q.categoryId, q.envelopeId, q.envelopeId).first<{ spent: number }>();
    return r?.spent ?? 0;
  }

  async merchantHistory(ws: string) {
    const rows = (await this.db.prepare(`SELECT t.merchant, MIN(-a.amount) AS min, MAX(-a.amount) AS max,
        (SELECT t2.category_id FROM transactions t2 WHERE t2.workspace_id = t.workspace_id AND t2.merchant = t.merchant AND t2.deleted_at IS NULL
         ORDER BY t2.occurred_at DESC LIMIT 1) AS categoryId
      FROM transactions t JOIN allocations a ON a.transaction_id = t.id
      WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' AND t.merchant IS NOT NULL
      GROUP BY t.merchant`).bind(ws).all<{ merchant: string; min: number; max: number; categoryId: string | null }>()).results;
    return Object.fromEntries(rows.map(r => [r.merchant, { min: r.min, max: r.max, categoryId: r.categoryId }]));
  }

  async lastAccountId(ws: string) {
    const r = await this.db.prepare(`SELECT e.account_id FROM entries e JOIN transactions t ON t.id = e.transaction_id
      WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' ORDER BY t.created_at DESC, t.occurred_at DESC LIMIT 1`)
      .bind(ws).first<{ account_id: string }>();
    return r?.account_id ?? null;
  }
}
