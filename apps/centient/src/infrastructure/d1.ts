// D1 adapters for the ports. Every query filters on workspace_id: D1 has no row-level
// security, so this is the wall between workspaces.
import type { NewTransaction } from '../domain/ledger';
import type {
  Account, Alias, Attachment, Budget, CatalogRepository, Category, Envelope, EntryKind, EntryView, InstallmentRepository, LedgerRepository, NewEntry,
  PartyRow, PaymentRow, PlanRow, Price, PriceRepository, TxFilter, TxView, Workspace,
} from '../application/ports';

const uid = () => crypto.randomUUID();

// Few and broad on purpose: each one should be obvious to pick. "Fees" is looked up by name for transfer fees.
const SEED_EXPENSE = ['Food & Drink', 'Transport', 'Home & Bills', 'Shopping', 'Health', 'Fun', 'Education',
  'Family & Giving', 'Fees', 'Other'];
// "Balance adjustment" holds uncategorised balance corrections (signed), so it is not a spending category.
const SEED_INCOME = ['Salary', 'Angpao & THR', 'Interest & cashback', 'Opening balance', 'Balance adjustment', 'Other income'];

// A new workspace's accounts: how most people in Indonesia hold money day to day. Each gets a Main pocket.
const SEED_ACCOUNTS: [string, string][] = [['Main Account', 'BANK'], ['Dailies', 'EWALLET'], ['Miscs', 'DEBIT_CARD']];

// "Debit card" is stored as kind BANK + subtype DEBIT_CARD (migration 0007: the accounts table's kind CHECK
// cannot change without a rebuild that D1's always-on foreign keys block). Only this file knows that.
const KIND_SQL = "CASE WHEN subtype = 'DEBIT_CARD' THEN 'DEBIT_CARD' ELSE kind END";
const storedKind = (kind: string) => (kind === 'DEBIT_CARD' ? { kind: 'BANK', subtype: 'DEBIT_CARD' } : { kind, subtype: null });

/** Columns a PATCH may touch, per table. Anything else in the request is ignored. */
const PATCHABLE: Record<string, string[]> = {
  accounts: ['name', 'kind', 'subtype', 'provider', 'currency_code', 'default_envelope_id', 'due_day', 'reconciled_at', 'archived_at'],
  envelopes: ['name', 'currency_code', 'target_amount', 'target_date', 'archived_at', 'color'],
  categories: ['name', 'archived_at'],
};

export class D1Catalog implements CatalogRepository {
  constructor(private db: D1Database) {}

  async ensureWorkspace(email: string) {
    await this.db.prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)').bind(uid(), email.toLowerCase()).run();
    const user = await this.db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: string }>();
    const userId = user!.id;
    // Oldest live workspace first (rowid order), so a user who has duplicates always lands in the same one.
    const live = () => this.db.prepare(`SELECT m.workspace_id FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ? AND w.deleted_at IS NULL ORDER BY w.rowid LIMIT 1`).bind(userId).first<{ workspace_id: string }>();
    const member = await live();
    if (member) return { userId, workspaceId: member.workspace_id };

    // The app's first screen sends several requests at once; each would seed its own workspace. The id is
    // derived from the user and how many workspaces they have had (a reset adds one), so simultaneous first
    // requests pick the same id: one seeding commits, the others fail on its unique rows and read it back.
    const { n } = (await this.db.prepare('SELECT COUNT(*) AS n FROM workspace_members WHERE user_id = ?').bind(userId).first<{ n: number }>())!;
    const ws = `${userId}:${n + 1}`;
    const s = (sql: string, ...v: unknown[]) => this.db.prepare(sql).bind(...v);
    try {
      await this.seed(ws, userId, s);
    } catch (e) {
      const won = await live();
      if (won) return { userId, workspaceId: won.workspace_id };
      throw e;
    }
    return { userId, workspaceId: ws };
  }

  private async seed(ws: string, userId: string, s: (sql: string, ...v: unknown[]) => D1PreparedStatement) {
    await this.db.batch([
      s('INSERT INTO workspaces (id, name) VALUES (?, ?)', ws, 'My money'),
      s("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'OWNER')", ws, userId),
      ...SEED_ACCOUNTS.flatMap(([name, kind]) => this.accountStatements(ws, uid(), { name, kind, provider: null, currency_code: 'IDR', due_day: null })),
      ...SEED_EXPENSE.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'EXPENSE')", uid(), ws, n)),
      ...SEED_INCOME.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'INCOME')", uid(), ws, n)),
    ]);
  }

  async getWorkspace(ws: string) {
    return (await this.db.prepare('SELECT id, name, cycle_start_day, onboarded_at FROM workspaces WHERE id = ?').bind(ws).first<Workspace>())!;
  }

  async updateWorkspace(ws: string, patch: { name?: string; cycle_start_day?: number; onboarded_at?: string }) {
    await this.db.prepare('UPDATE workspaces SET name = COALESCE(?, name), cycle_start_day = COALESCE(?, cycle_start_day), onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?')
      .bind(patch.name ?? null, patch.cycle_start_day ?? null, patch.onboarded_at ?? null, ws).run();
  }

  /** An account and its Main pocket (its default): account first, pocket, then the default link. */
  private accountStatements(ws: string, id: string, a: { name: string; kind: string; provider: string | null; currency_code: string; due_day: number | null }) {
    const k = storedKind(a.kind);
    const main = `${id}:main`;
    return [
      this.db.prepare('INSERT INTO accounts (id, workspace_id, name, kind, subtype, provider, currency_code, due_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ws, a.name, k.kind, k.subtype, a.provider, a.currency_code, a.due_day),
      this.db.prepare("INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind) VALUES (?, ?, ?, 'Main', ?, 'SPENDING')").bind(main, ws, id, a.currency_code),
      this.db.prepare('UPDATE accounts SET default_envelope_id = ? WHERE id = ?').bind(main, id),
    ];
  }

  private async all<T>(sql: string, ws: string) {
    return (await this.db.prepare(sql).bind(ws).all<T>()).results;
  }
  listAccounts(ws: string) { return this.all<Account>(`SELECT id, name, ${KIND_SQL} AS kind, provider, currency_code, default_envelope_id, due_day, reconciled_at, archived_at FROM accounts WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY name`, ws); }
  // Main first in each account, then by name.
  listEnvelopes(ws: string) { return this.all<Envelope>("SELECT e.id, e.account_id, e.name, e.currency_code, e.kind, e.target_amount, e.target_date, e.archived_at, e.color, e.pattern FROM envelopes e JOIN accounts a ON a.id = e.account_id AND a.deleted_at IS NULL WHERE e.workspace_id = ? ORDER BY e.account_id, e.id <> a.default_envelope_id, e.name", ws); }
  listCategories(ws: string) { return this.all<Category>('SELECT id, name, kind, archived_at FROM categories WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY kind, name', ws); }

  async createAccount(ws: string, a: Omit<Account, 'id' | 'reconciled_at' | 'archived_at' | 'default_envelope_id'>) {
    const id = uid();
    await this.db.batch(this.accountStatements(ws, id, a));
    return { ...a, id, default_envelope_id: `${id}:main`, reconciled_at: null, archived_at: null };
  }

  async createEnvelope(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>) {
    const id = uid();
    await this.db.prepare('INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind, target_amount, target_date, color, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ws, e.account_id, e.name, e.currency_code, e.kind, e.target_amount, e.target_date, e.color, e.pattern).run();
    return { ...e, id, archived_at: null };
  }

  async createCategory(ws: string, c: Omit<Category, 'id' | 'archived_at'>) {
    const id = uid();
    await this.db.prepare('INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, ?)').bind(id, ws, c.name, c.kind).run();
    return { ...c, id, archived_at: null };
  }

  async update(ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>) {
    if (table === 'accounts' && typeof patch.kind === 'string') patch = { ...patch, ...storedKind(patch.kind) };
    const cols = Object.keys(patch).filter(k => PATCHABLE[table].includes(k));
    if (!cols.length) return true;
    const live = table === 'accounts' ? ' AND deleted_at IS NULL' : '';
    const r = await this.db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND workspace_id = ?${live}`)
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

  async deleteAccount(ws: string, id: string, now: string) {
    // Whole entries go, so a split bill paid from this account disappears with its IOU half.
    // ponytail: the name gets a suffix because accounts keep UNIQUE (workspace_id, name); a partial
    // index needs a table rebuild, worth it only if deleted names must stay readable in the database.
    const [, , acc] = await this.db.batch([
      this.db.prepare(`UPDATE entry_groups SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (
        SELECT t.group_id FROM transactions t JOIN entries e ON e.transaction_id = t.id
        WHERE t.workspace_id = ? AND e.account_id = ? AND t.deleted_at IS NULL)`).bind(now, ws, ws, id),
      this.db.prepare(`UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE workspace_id = ? AND deleted_at IS NULL
        AND group_id IN (SELECT id FROM entry_groups WHERE workspace_id = ? AND deleted_at = ?)`).bind(now, now, ws, ws, now),
      this.db.prepare(`UPDATE accounts SET deleted_at = ?, name = name || ' (deleted ' || ? || ')' WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`)
        .bind(now, now, id, ws),
    ]);
    return acc.meta.changes > 0;
  }

  async deleteCategory(ws: string, id: string, moveTo: string, now: string) {
    // Everything that points at the category moves first (as in migration 0004), then it is flagged and
    // renamed to free its UNIQUE name, so a new category can take it.
    const moved = (col: string) => `${col} = CASE WHEN ${col} = ? THEN ? ELSE ${col} END`;
    const [, , , , , , , cat] = await this.db.batch([
      this.db.prepare(`UPDATE transactions SET ${moved('category_id')} WHERE workspace_id = ? AND category_id = ?`).bind(id, moveTo, ws, id),
      this.db.prepare("UPDATE entry_groups SET command = json_set(command, '$.categoryId', ?) WHERE workspace_id = ? AND command IS NOT NULL AND json_extract(command, '$.categoryId') = ?").bind(moveTo, ws, id),
      this.db.prepare("UPDATE aliases SET value = ? WHERE workspace_id = ? AND kind = 'CATEGORY' AND value = ?").bind(moveTo, ws, id),
      this.db.prepare('UPDATE recurring SET category_id = ? WHERE workspace_id = ? AND category_id = ?').bind(moveTo, ws, id),
      this.db.prepare('UPDATE inbox_items SET category_id = ? WHERE workspace_id = ? AND category_id = ?').bind(moveTo, ws, id),
      // A budget on the deleted category goes if the target already has one, else follows it.
      this.db.prepare(`UPDATE budgets SET deleted_at = ? WHERE workspace_id = ? AND category_id = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM budgets t WHERE t.workspace_id = budgets.workspace_id AND t.category_id = ? AND IFNULL(t.envelope_id, '') = IFNULL(budgets.envelope_id, '') AND t.deleted_at IS NULL)`).bind(now, ws, id, moveTo),
      this.db.prepare('UPDATE budgets SET category_id = ? WHERE workspace_id = ? AND category_id = ? AND deleted_at IS NULL').bind(moveTo, ws, id),
      this.db.prepare("UPDATE categories SET deleted_at = ?, name = name || ' (deleted ' || ? || ')' WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(now, now, id, ws),
    ]);
    return cat.meta.changes > 0;
  }

  async resetWorkspace(ws: string, now: string) {
    await this.db.prepare('UPDATE workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, ws).run();
  }

  async deleteBudget(ws: string, id: string) {
    const r = await this.db.prepare("UPDATE budgets SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
    return r.meta.changes > 0;
  }
}

export class D1Ledger implements LedgerRepository {
  constructor(private db: D1Database) {}

  private txStatements(ws: string, groupId: string, t: NewTransaction): D1PreparedStatement[] {
    const id = uid();
    return [
      this.db.prepare('INSERT INTO transactions (id, workspace_id, group_id, type, occurred_at, category_id, merchant, note, original_amount, original_currency, spread_cycles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ws, groupId, t.type, t.occurredAt, t.categoryId, t.merchant, t.note, t.originalAmount ?? null, t.originalCurrency ?? null, t.spreadCycles ?? 1),
      ...t.entries.map(e => this.db.prepare('INSERT INTO entries (transaction_id, account_id, amount) VALUES (?, ?, ?)').bind(id, e.accountId, e.amount)),
      ...t.allocations.map(a => this.db.prepare('INSERT INTO allocations (transaction_id, envelope_id, amount) VALUES (?, ?, ?)').bind(id, a.envelopeId, a.amount)),
    ];
  }

  async insert(ws: string, entries: NewEntry[]) {
    const ids: string[] = [];
    const stmts: D1PreparedStatement[] = [];
    for (const g of entries) {
      const gid = uid();
      ids.push(gid);
      stmts.push(this.db.prepare('INSERT INTO entry_groups (id, workspace_id, kind, command) VALUES (?, ?, ?, ?)')
        .bind(gid, ws, g.kind, g.command === null ? null : JSON.stringify(g.command)));
      for (const t of g.txs) stmts.push(...this.txStatements(ws, gid, t));
    }
    await this.db.batch(stmts); // one batch = one atomic write
    return ids;
  }

  async replace(ws: string, entryId: string, command: unknown, txs: NewTransaction[]) {
    const inGroup = 'SELECT id FROM transactions WHERE group_id = ? AND workspace_id = ?';
    await this.db.batch([
      this.db.prepare(`DELETE FROM entries WHERE transaction_id IN (${inGroup})`).bind(entryId, ws),
      this.db.prepare(`DELETE FROM allocations WHERE transaction_id IN (${inGroup})`).bind(entryId, ws),
      this.db.prepare('DELETE FROM transactions WHERE group_id = ? AND workspace_id = ?').bind(entryId, ws),
      ...txs.flatMap(t => this.txStatements(ws, entryId, t)),
      this.db.prepare("UPDATE entry_groups SET command = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?")
        .bind(JSON.stringify(command), entryId, ws),
    ]);
  }

  async deleteEntry(ws: string, id: string) {
    const [g] = await this.db.batch([
      this.db.prepare("UPDATE entry_groups SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws),
      this.db.prepare("UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE group_id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws),
    ]);
    return g.meta.changes > 0;
  }

  async getEntry(ws: string, id: string) {
    const row = await this.db.prepare('SELECT id, kind, command, icon FROM entry_groups WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL')
      .bind(id, ws).first<GroupRow>();
    if (!row) return null;
    return (await this.withTransactions(ws, [row]))[0] ?? null;
  }

  async listEntries(ws: string, f: TxFilter) {
    const { where, args } = txWhere(ws, f);
    where.push('g.deleted_at IS NULL');
    let having = '';
    if (f.cursor) {
      const [at, id] = f.cursor.split('|');
      having = 'HAVING (MIN(t.occurred_at), g.id) < (?, ?)';
      args.push(at, id);
    }
    const rows = (await this.db.prepare(`SELECT g.id, g.kind, g.command, g.icon
      FROM entry_groups g JOIN transactions t ON t.group_id = g.id
      WHERE ${where.join(' AND ')} GROUP BY g.id ${having}
      ORDER BY MIN(t.occurred_at) DESC, g.id DESC LIMIT ?`).bind(...args, f.limit + 1).all<GroupRow>()).results;
    const items = await this.withTransactions(ws, rows.slice(0, f.limit));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > f.limit && last ? `${last.occurred_at}|${last.id}` : null };
  }

  /** Loads each group's live transactions and icon (its own, else its merchant's); groups with none left are dropped. */
  private async withTransactions(ws: string, groups: GroupRow[]): Promise<EntryView[]> {
    if (!groups.length) return [];
    const txs = (await this.db.prepare(`SELECT id, group_id, type, occurred_at, category_id, merchant, note, original_amount, original_currency
      FROM transactions WHERE group_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL ORDER BY occurred_at, created_at`)
      .bind(JSON.stringify(groups.map(g => g.id))).all<Omit<TxView, 'entries' | 'allocations'> & { group_id: string }>()).results;
    const views = await this.withLines(txs);
    const merchants = [...new Set(txs.map(t => t.merchant).filter((m): m is string => Boolean(m)))];
    const icons = merchants.length ? Object.fromEntries((await this.db.prepare('SELECT merchant, icon FROM merchant_icons WHERE workspace_id = ? AND merchant IN (SELECT value FROM json_each(?))')
      .bind(ws, JSON.stringify(merchants)).all<{ merchant: string; icon: string }>()).results.map(r => [r.merchant, r.icon])) : {};
    return groups.flatMap(g => {
      const own = views.filter(t => t.group_id === g.id).map(({ group_id: _, ...t }) => t);
      if (!own.length) return [];
      const merchant = own.find(t => t.merchant)?.merchant;
      const icon = g.icon ?? (merchant ? icons[merchant] ?? null : null);
      return [{ id: g.id, kind: g.kind, command: g.command === null ? null : JSON.parse(g.command), icon, occurred_at: own[0].occurred_at, transactions: own }];
    });
  }

  /** Attaches entry and allocation lines; json_each keeps the bound-parameter count at one, whatever the page size. */
  private async withLines<T extends { id: string }>(rows: T[]) {
    const ids = JSON.stringify(rows.map(r => r.id));
    const [entries, allocations] = await this.db.batch<{ transaction_id: string; account_id?: string; envelope_id?: string; amount: number }>([
      this.db.prepare('SELECT transaction_id, account_id, amount FROM entries WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
      this.db.prepare('SELECT transaction_id, envelope_id, amount FROM allocations WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
    ]);
    return rows.map(r => ({
      ...r,
      entries: entries.results.filter(e => e.transaction_id === r.id).map(e => ({ account_id: e.account_id!, amount: e.amount })),
      allocations: allocations.results.filter(a => a.transaction_id === r.id).map(a => ({ envelope_id: a.envelope_id!, amount: a.amount })),
    }));
  }

  async hasTransactions(ws: string, accountId: string) {
    const r = await this.db.prepare(`SELECT 1 AS yes FROM entries e JOIN transactions t ON t.id = e.transaction_id
      WHERE t.workspace_id = ? AND e.account_id = ? AND t.deleted_at IS NULL LIMIT 1`).bind(ws, accountId).first<{ yes: number }>();
    return Boolean(r);
  }

  async list(ws: string, f: TxFilter) {
    const { where, args } = txWhere(ws, f);
    if (f.cursor) {
      const [at, id] = f.cursor.split('|');
      where.push('(t.occurred_at, t.id) < (?, ?)'); args.push(at, id);
    }
    const rows = (await this.db.prepare(`SELECT t.id, t.type, t.occurred_at, t.category_id, t.merchant, t.note, t.original_amount, t.original_currency
      FROM transactions t WHERE ${where.join(' AND ')} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ?`).bind(...args, f.limit + 1)
      .all<Omit<TxView, 'entries' | 'allocations'>>()).results;
    const page = rows.slice(0, f.limit);
    const items = await this.withLines(page);
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

  async setIcon(ws: string, entryId: string, icon: string | null, merchant: string | null) {
    const [r] = await this.db.batch([
      this.db.prepare('UPDATE entry_groups SET icon = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL').bind(icon, entryId, ws),
      ...(merchant ? [icon
        ? this.db.prepare('INSERT INTO merchant_icons (workspace_id, merchant, icon) VALUES (?, ?, ?) ON CONFLICT (workspace_id, merchant) DO UPDATE SET icon = excluded.icon').bind(ws, merchant, icon)
        : this.db.prepare('DELETE FROM merchant_icons WHERE workspace_id = ? AND merchant = ?').bind(ws, merchant)] : []),
    ]);
    return r.meta.changes > 0;
  }

  async lastAccountId(ws: string) {
    const r = await this.db.prepare(`SELECT e.account_id FROM entries e JOIN transactions t ON t.id = e.transaction_id
      WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' ORDER BY t.created_at DESC, t.occurred_at DESC LIMIT 1`)
      .bind(ws).first<{ account_id: string }>();
    return r?.account_id ?? null;
  }
}

export class D1Prices implements PriceRepository {
  constructor(private db: D1Database) {}

  async get(codes: string[]) {
    if (!codes.length) return [];
    return (await this.db.prepare('SELECT currency_code, idr_per_unit, fetched_at FROM prices WHERE currency_code IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(codes)).all<Price>()).results;
  }

  async save(prices: Price[]) {
    if (!prices.length) return;
    await this.db.batch(prices.map(p => this.db.prepare(`INSERT INTO prices (currency_code, idr_per_unit, fetched_at) VALUES (?, ?, ?)
      ON CONFLICT (currency_code) DO UPDATE SET idr_per_unit = excluded.idr_per_unit, fetched_at = excluded.fetched_at`).bind(p.currency_code, p.idr_per_unit, p.fetched_at)));
  }
}

export class D1Installments implements InstallmentRepository {
  constructor(private db: D1Database) {}

  async createPlan(ws: string, p: Omit<PlanRow, 'created_at'>, parties: PartyRow[], prepaid: Omit<PaymentRow, 'proof'>[]) {
    await this.db.batch([
      this.db.prepare('INSERT INTO installment_plans (id, workspace_id, account_id, name, amount_per_installment, installments, first_due) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(p.id, ws, p.account_id, p.name, p.amount_per_installment, p.installments, p.first_due),
      ...parties.map(x => this.db.prepare('INSERT INTO installment_parties (plan_id, seq, name, iou_account_id, share) VALUES (?, ?, ?, ?, ?)')
        .bind(p.id, x.seq, x.name, x.iou_account_id, x.share)),
      ...prepaid.map(x => this.db.prepare('INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id) VALUES (?, ?, ?, ?, ?)')
        .bind(p.id, x.installment_no, x.party_seq, x.paid_at, x.entry_id)),
    ]);
  }

  async listPlans(ws: string, accountId?: string) {
    const live = 'workspace_id = ? AND deleted_at IS NULL AND (? IS NULL OR account_id = ?)';
    const ids = `SELECT id FROM installment_plans WHERE ${live}`;
    const a = [ws, accountId ?? null, accountId ?? null];
    const [plans, parties, payments] = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(`SELECT id, account_id, name, amount_per_installment, installments, first_due, created_at FROM installment_plans WHERE ${live} ORDER BY first_due, created_at`).bind(...a),
      this.db.prepare(`SELECT plan_id, seq, name, iou_account_id, share FROM installment_parties WHERE plan_id IN (${ids}) ORDER BY plan_id, seq`).bind(...a),
      // A share stays paid only while its logged entry exists: deleting the transfer un-pays it.
      this.db.prepare(`SELECT p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, f.id AS proof_id, f.filename AS proof_filename, f.content_type AS proof_type
        FROM installment_payments p LEFT JOIN entry_groups g ON g.id = p.entry_id LEFT JOIN attachments f ON f.id = p.proof_id
        WHERE p.plan_id IN (${ids}) AND (p.entry_id IS NULL OR g.deleted_at IS NULL)`).bind(...a),
    ]);
    return {
      plans: plans.results as PlanRow[],
      parties: parties.results as PartyRow[],
      payments: payments.results.map(r => ({
        plan_id: r.plan_id as string, installment_no: r.installment_no as number, party_seq: r.party_seq as number,
        paid_at: r.paid_at as string, entry_id: r.entry_id as string | null,
        proof: r.proof_id ? { id: r.proof_id as string, filename: r.proof_filename as string, content_type: r.proof_type as string } : null,
      })),
    };
  }

  private owned = 'plan_id IN (SELECT id FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)';

  async addPayment(ws: string, p: Omit<PaymentRow, 'proof'>) {
    // A row left behind by a deleted entry is replaced, so the share can be paid again.
    const r = await this.db.prepare(`INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)
      ON CONFLICT (plan_id, installment_no, party_seq) DO UPDATE SET paid_at = excluded.paid_at, entry_id = excluded.entry_id, proof_id = NULL
      WHERE installment_payments.entry_id IS NOT NULL AND (SELECT deleted_at FROM entry_groups WHERE id = installment_payments.entry_id) IS NOT NULL`)
      .bind(p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, p.plan_id, ws).run();
    if (!r.meta.changes) throw new Error('ALREADY_PAID');
  }

  async deletePayment(ws: string, planId: string, no: number, seq: number) {
    const row = await this.db.prepare(`SELECT entry_id FROM installment_payments WHERE ${this.owned} AND installment_no = ? AND party_seq = ?`)
      .bind(planId, ws, no, seq).first<{ entry_id: string | null }>();
    if (!row) return undefined;
    await this.db.prepare(`DELETE FROM installment_payments WHERE ${this.owned} AND installment_no = ? AND party_seq = ?`).bind(planId, ws, no, seq).run();
    return row.entry_id;
  }

  async setProof(ws: string, planId: string, no: number, seq: number, attachmentId: string | null) {
    const r = await this.db.prepare(`UPDATE installment_payments SET proof_id = ? WHERE ${this.owned} AND installment_no = ? AND party_seq = ?`)
      .bind(attachmentId, planId, ws, no, seq).run();
    return r.meta.changes > 0;
  }

  async deletePlan(ws: string, id: string) {
    const r = await this.db.prepare("UPDATE installment_plans SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
    return r.meta.changes > 0;
  }

  async createAttachment(ws: string, a: Attachment) {
    await this.db.prepare('INSERT INTO attachments (id, workspace_id, r2_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(a.id, ws, a.r2_key, a.filename, a.content_type, a.size).run();
  }

  async getAttachment(ws: string, id: string) {
    return this.db.prepare('SELECT id, r2_key, filename, content_type, size FROM attachments WHERE id = ? AND workspace_id = ?').bind(id, ws).first<Attachment>();
  }
}

type GroupRow = { id: string; kind: EntryKind; command: string | null; icon: string | null };

/** Transaction filters shared by the transaction list and the entry list (alias `t`). */
function txWhere(ws: string, f: TxFilter) {
  const where = ['t.workspace_id = ?', 't.deleted_at IS NULL'];
  const args: unknown[] = [ws];
  if (f.from) { where.push('substr(t.occurred_at, 1, 10) >= ?'); args.push(f.from); }
  if (f.to) { where.push('substr(t.occurred_at, 1, 10) <= ?'); args.push(f.to); }
  if (f.type) { where.push('t.type = ?'); args.push(f.type); }
  if (f.categoryId) { where.push('t.category_id = ?'); args.push(f.categoryId); }
  if (f.accountId) { where.push('EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = t.id AND e.account_id = ?)'); args.push(f.accountId); }
  if (f.envelopeId) { where.push('EXISTS (SELECT 1 FROM allocations a WHERE a.transaction_id = t.id AND a.envelope_id = ?)'); args.push(f.envelopeId); }
  return { where, args };
}
