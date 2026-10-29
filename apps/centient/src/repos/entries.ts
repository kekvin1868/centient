// The ledger: entries (what the user logged) -> transactions -> account lines (entries) + pocket lines (allocations).
import type { NewTransaction } from '../domain/ledger';
import { currencyRow } from './currencies';
import { uid } from './sql';

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

type GroupRow = { id: string; kind: EntryKind; command: string | null; icon: string | null };

export function entriesRepo(db: D1Database) {
  function txStatements(ws: string, groupId: string, t: NewTransaction): D1PreparedStatement[] {
    const id = uid();
    return [
      ...(t.originalCurrency ? [currencyRow(db, t.originalCurrency)] : []),
      db.prepare('INSERT INTO transactions (id, workspace_id, group_id, type, occurred_at, category_id, merchant, note, original_amount, original_currency, spread_cycles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ws, groupId, t.type, t.occurredAt, t.categoryId, t.merchant, t.note, t.originalAmount ?? null, t.originalCurrency ?? null, t.spreadCycles ?? 1),
      ...t.entries.map(e => db.prepare('INSERT INTO entries (transaction_id, account_id, amount) VALUES (?, ?, ?)').bind(id, e.accountId, e.amount)),
      ...t.allocations.map(a => db.prepare('INSERT INTO allocations (transaction_id, envelope_id, amount) VALUES (?, ?, ?)').bind(id, a.envelopeId, a.amount)),
    ];
  }

  function insertStatements(ws: string, entries: NewEntry[]) {
    const ids: string[] = [];
    const stmts: D1PreparedStatement[] = [];
    for (const g of entries) {
      const gid = uid();
      ids.push(gid);
      stmts.push(db.prepare('INSERT INTO entry_groups (id, workspace_id, kind, command) VALUES (?, ?, ?, ?)')
        .bind(gid, ws, g.kind, g.command === null ? null : JSON.stringify(g.command)));
      for (const t of g.txs) stmts.push(...txStatements(ws, gid, t));
    }
    return { ids, stmts };
  }

  /** Attaches entry and allocation lines; json_each keeps the bound-parameter count at one, whatever the page size. */
  async function withLines<T extends { id: string }>(rows: T[]) {
    const ids = JSON.stringify(rows.map(r => r.id));
    const [entries, allocations] = await db.batch<{ transaction_id: string; account_id?: string; envelope_id?: string; amount: number }>([
      db.prepare('SELECT transaction_id, account_id, amount FROM entries WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
      db.prepare('SELECT transaction_id, envelope_id, amount FROM allocations WHERE transaction_id IN (SELECT value FROM json_each(?))').bind(ids),
    ]);
    return rows.map(r => ({
      ...r,
      entries: entries.results.filter(e => e.transaction_id === r.id).map(e => ({ account_id: e.account_id!, amount: e.amount })),
      allocations: allocations.results.filter(a => a.transaction_id === r.id).map(a => ({ envelope_id: a.envelope_id!, amount: a.amount })),
    }));
  }

  /** Loads each group's live transactions and icon (its own, else its merchant's); groups with none left are dropped. */
  async function withTransactions(ws: string, groups: GroupRow[]): Promise<EntryView[]> {
    if (!groups.length) return [];
    const txs = (await db.prepare(`SELECT id, group_id, type, occurred_at, category_id, merchant, note, original_amount, original_currency
      FROM transactions WHERE group_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL ORDER BY occurred_at, created_at`)
      .bind(JSON.stringify(groups.map(g => g.id))).all<Omit<TxView, 'entries' | 'allocations'> & { group_id: string }>()).results;
    const views = await withLines(txs);
    const merchants = [...new Set(txs.map(t => t.merchant).filter((m): m is string => Boolean(m)))];
    const icons = merchants.length ? Object.fromEntries((await db.prepare('SELECT merchant, icon FROM merchant_icons WHERE workspace_id = ? AND merchant IN (SELECT value FROM json_each(?))')
      .bind(ws, JSON.stringify(merchants)).all<{ merchant: string; icon: string }>()).results.map(r => [r.merchant, r.icon])) : {};
    return groups.flatMap(g => {
      const own = views.filter(t => t.group_id === g.id).map(({ group_id: _, ...t }) => t);
      if (!own.length) return [];
      const merchant = own.find(t => t.merchant)?.merchant;
      const icon = g.icon ?? (merchant ? icons[merchant] ?? null : null);
      return [{ id: g.id, kind: g.kind, command: g.command === null ? null : JSON.parse(g.command), icon, occurred_at: own[0].occurred_at, transactions: own }];
    });
  }

  return {
    /** The statements that write these entries, for a caller that batches them with other writes. */
    insertStatements,

    /** Writes every entry, its transactions and their lines in one atomic batch; returns the entry ids. */
    async insert(ws: string, entries: NewEntry[]) {
      const { ids, stmts } = insertStatements(ws, entries);
      await db.batch(stmts); // one batch = one atomic write
      return ids;
    },

    /** Replaces an entry's transactions and saved command in one atomic batch. */
    async replace(ws: string, entryId: string, command: unknown, txs: NewTransaction[]) {
      const inGroup = 'SELECT id FROM transactions WHERE group_id = ? AND workspace_id = ?';
      await db.batch([
        db.prepare(`DELETE FROM entries WHERE transaction_id IN (${inGroup})`).bind(entryId, ws),
        db.prepare(`DELETE FROM allocations WHERE transaction_id IN (${inGroup})`).bind(entryId, ws),
        db.prepare('DELETE FROM transactions WHERE group_id = ? AND workspace_id = ?').bind(entryId, ws),
        ...txs.flatMap(t => txStatements(ws, entryId, t)),
        db.prepare("UPDATE entry_groups SET command = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?")
          .bind(JSON.stringify(command), entryId, ws),
      ]);
    },

    /** Soft-deletes the entry and all its transactions; false when it is not in this workspace. */
    async remove(ws: string, id: string) {
      const [g] = await db.batch([
        db.prepare("UPDATE entry_groups SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws),
        db.prepare("UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE group_id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws),
      ]);
      return g.meta.changes > 0;
    },

    async get(ws: string, id: string) {
      const row = await db.prepare('SELECT id, kind, command, icon FROM entry_groups WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL')
        .bind(id, ws).first<GroupRow>();
      if (!row) return null;
      return (await withTransactions(ws, [row]))[0] ?? null;
    },

    /** One item per entry, newest first; a filter matches when any of its transactions matches. */
    async listEntries(ws: string, f: TxFilter) {
      const { where, args } = txWhere(ws, f);
      where.push('g.deleted_at IS NULL');
      let having = '';
      if (f.cursor) {
        const [at, id] = f.cursor.split('|');
        having = 'HAVING (MIN(t.occurred_at), g.id) < (?, ?)';
        args.push(at, id);
      }
      const rows = (await db.prepare(`SELECT g.id, g.kind, g.command, g.icon
        FROM entry_groups g JOIN transactions t ON t.group_id = g.id
        WHERE ${where.join(' AND ')} GROUP BY g.id ${having}
        ORDER BY MIN(t.occurred_at) DESC, g.id DESC LIMIT ?`).bind(...args, f.limit + 1).all<GroupRow>()).results;
      const items = await withTransactions(ws, rows.slice(0, f.limit));
      const last = items.at(-1);
      return { items, nextCursor: rows.length > f.limit && last ? `${last.occurred_at}|${last.id}` : null };
    },

    async hasTransactions(ws: string, accountId: string) {
      const r = await db.prepare(`SELECT 1 AS yes FROM entries e JOIN transactions t ON t.id = e.transaction_id
        WHERE t.workspace_id = ? AND e.account_id = ? AND t.deleted_at IS NULL LIMIT 1`).bind(ws, accountId).first<{ yes: number }>();
      return Boolean(r);
    },

    /** Raw transactions, newest first (CSV export, debugging). */
    async list(ws: string, f: TxFilter) {
      const { where, args } = txWhere(ws, f);
      if (f.cursor) {
        const [at, id] = f.cursor.split('|');
        where.push('(t.occurred_at, t.id) < (?, ?)'); args.push(at, id);
      }
      const rows = (await db.prepare(`SELECT t.id, t.type, t.occurred_at, t.category_id, t.merchant, t.note, t.original_amount, t.original_currency
        FROM transactions t WHERE ${where.join(' AND ')} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ?`).bind(...args, f.limit + 1)
        .all<Omit<TxView, 'entries' | 'allocations'>>()).results;
      const page = rows.slice(0, f.limit);
      const items = await withLines(page);
      const last = page.at(-1);
      return { items, nextCursor: rows.length > f.limit && last ? `${last.occurred_at}|${last.id}` : null };
    },

    async balances(ws: string) {
      const [acc, env] = await db.batch<{ id: string; balance: number }>([
        db.prepare('SELECT e.account_id AS id, SUM(e.amount) AS balance FROM entries e JOIN transactions t ON t.id = e.transaction_id WHERE t.workspace_id = ? AND t.deleted_at IS NULL GROUP BY e.account_id').bind(ws),
        db.prepare('SELECT a.envelope_id AS id, SUM(a.amount) AS balance FROM allocations a JOIN transactions t ON t.id = a.transaction_id WHERE t.workspace_id = ? AND t.deleted_at IS NULL GROUP BY a.envelope_id').bind(ws),
      ]);
      const map = (rows: { id: string; balance: number }[]) => Object.fromEntries(rows.map(r => [r.id, r.balance]));
      return { accounts: map(acc.results), envelopes: map(env.results) };
    },

    /** IDR spent in [from, to) on EXPENSE allocations matching the category and/or envelope. */
    async spent(ws: string, q: { categoryId: string | null; envelopeId: string | null; from: string; to: string }) {
      // ponytail: spread_cycles (0% instalments) not applied yet; the full amount counts in the purchase cycle.
      const r = await db.prepare(`SELECT COALESCE(SUM(-a.amount), 0) AS spent
        FROM transactions t JOIN allocations a ON a.transaction_id = t.id JOIN envelopes e ON e.id = a.envelope_id AND e.currency_code = 'IDR'
        WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE'
          AND substr(t.occurred_at, 1, 10) >= ? AND substr(t.occurred_at, 1, 10) < ?
          AND (? IS NULL OR t.category_id = ?) AND (? IS NULL OR a.envelope_id = ?)`)
        .bind(ws, q.from, q.to, q.categoryId, q.categoryId, q.envelopeId, q.envelopeId).first<{ spent: number }>();
      return r?.spent ?? 0;
    },

    async merchantHistory(ws: string) {
      const rows = (await db.prepare(`SELECT t.merchant, MIN(-a.amount) AS min, MAX(-a.amount) AS max,
          (SELECT t2.category_id FROM transactions t2 WHERE t2.workspace_id = t.workspace_id AND t2.merchant = t.merchant AND t2.deleted_at IS NULL
           ORDER BY t2.occurred_at DESC LIMIT 1) AS categoryId
        FROM transactions t JOIN allocations a ON a.transaction_id = t.id
        WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' AND t.merchant IS NOT NULL
        GROUP BY t.merchant`).bind(ws).all<{ merchant: string; min: number; max: number; categoryId: string | null }>()).results;
      return Object.fromEntries(rows.map(r => [r.merchant, { min: r.min, max: r.max, categoryId: r.categoryId }]));
    },

    /** Sets (or clears, null) an entry's icon; with `merchant`, also remembers it for that merchant. */
    async setIcon(ws: string, entryId: string, icon: string | null, merchant: string | null) {
      const [r] = await db.batch([
        db.prepare('UPDATE entry_groups SET icon = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL').bind(icon, entryId, ws),
        ...(merchant ? [icon
          ? db.prepare('INSERT INTO merchant_icons (workspace_id, merchant, icon) VALUES (?, ?, ?) ON CONFLICT (workspace_id, merchant) DO UPDATE SET icon = excluded.icon').bind(ws, merchant, icon)
          : db.prepare('DELETE FROM merchant_icons WHERE workspace_id = ? AND merchant = ?').bind(ws, merchant)] : []),
      ]);
      return r.meta.changes > 0;
    },

    async lastAccountId(ws: string) {
      const r = await db.prepare(`SELECT e.account_id FROM entries e JOIN transactions t ON t.id = e.transaction_id
        WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' ORDER BY t.created_at DESC, t.occurred_at DESC LIMIT 1`)
        .bind(ws).first<{ account_id: string }>();
      return r?.account_id ?? null;
    },
  };
}

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
