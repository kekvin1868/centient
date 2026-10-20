// Use cases. Each takes the workspace id from the verified session, never from the request body,
// and checks that every referenced account, envelope and category belongs to that workspace.
import { parseQuickAdd, type Draft } from '@centient/quickadd';
import { cycleStart, daysLeft, jakartaToday, nextCycleStart, toOccurredAt } from '../domain/cycle';
import {
  allocate, assertBalanced, DomainError, expense, income, splitShares, transfer,
  type AccountRef, type EnvelopeRef, type NewTransaction,
} from '../domain/ledger';
import type { Account, CatalogRepository, Category, Envelope, LedgerRepository, TxFilter } from './ports';

export type Deps = { catalog: CatalogRepository; ledger: LedgerRepository; now?: () => number };

export type Command =
  | { type: 'EXPENSE'; accountId: string; envelopeId?: string; categoryId: string; amount: number; date: string; merchant?: string; note?: string;
      split?: { people: number; iouAccountId: string }; originalAmount?: number; originalCurrency?: string }
  | { type: 'INCOME'; accountId: string; envelopeId?: string; categoryId: string; amount: number; date: string; merchant?: string; note?: string }
  | { type: 'TRANSFER'; fromAccountId: string; toAccountId: string; amount: number; toAmount?: number;
      fromEnvelopeId?: string; toEnvelopeId?: string; fee?: number; date: string; note?: string }
  | { type: 'ALLOCATE'; fromEnvelopeId: string; toEnvelopeId: string; amount: number; date: string; note?: string };

/** Everything a workspace has, loaded once per request; lookups throw NOT_FOUND for foreign ids. */
async function catalogOf(deps: Deps, ws: string) {
  const [accounts, envelopes, categories] = await Promise.all([
    deps.catalog.listAccounts(ws), deps.catalog.listEnvelopes(ws), deps.catalog.listCategories(ws),
  ]);
  const find = <T extends { id: string }>(rows: T[], id: string | undefined, what: string): T => {
    const row = rows.find(r => r.id === id);
    if (!row) throw new DomainError('NOT_FOUND', `${what} not found`);
    return row;
  };
  return {
    accounts, envelopes, categories,
    account: (id?: string): AccountRef & { row: Account } => { const a = find(accounts, id, 'Account'); return { id: a.id, currency: a.currency_code, row: a }; },
    envelope: (id?: string): EnvelopeRef => { const e = find(envelopes, id, 'Envelope'); return { id: e.id, currency: e.currency_code, kind: e.kind }; },
    category: (id: string | undefined, kind: Category['kind']): Category => {
      const c = find(categories, id, 'Category');
      if (c.kind !== kind) throw new DomainError('WRONG_CATEGORY_KIND', `${c.name} is an ${c.kind.toLowerCase()} category`);
      return c;
    },
    categoryByName: (name: string) => categories.find(c => c.name === name),
    /** The account's default envelope, else the first spending envelope in its currency. */
    defaultEnvelope(account: Account): EnvelopeRef {
      const e = envelopes.find(x => x.id === account.default_envelope_id && !x.archived_at)
        ?? envelopes.find(x => x.kind === 'SPENDING' && x.currency_code === account.currency_code && !x.archived_at);
      if (!e) throw new DomainError('NO_ENVELOPE', `Create an envelope in ${account.currency_code} first`);
      return { id: e.id, currency: e.currency_code, kind: e.kind };
    },
    currencyOf(id: string): string {
      return accounts.find(a => a.id === id)?.currency_code ?? envelopes.find(e => e.id === id)?.currency_code ?? '?';
    },
  };
}
type Cat = Awaited<ReturnType<typeof catalogOf>>;

function build(c: Cat, cmd: Command, now: number): NewTransaction[] {
  const occurredAt = toOccurredAt(cmd.date, now);
  switch (cmd.type) {
    case 'EXPENSE': {
      const account = c.account(cmd.accountId);
      const envelope = cmd.envelopeId ? c.envelope(cmd.envelopeId) : c.defaultEnvelope(account.row);
      const categoryId = c.category(cmd.categoryId, 'EXPENSE').id;
      const base = { occurredAt, account, envelope, categoryId, merchant: cmd.merchant, note: cmd.note, originalAmount: cmd.originalAmount, originalCurrency: cmd.originalCurrency };
      if (!cmd.split) return [expense({ ...base, amount: cmd.amount })];
      // Split bill: my share is spending; the rest is money the others owe me.
      const { mine, others } = splitShares(cmd.amount, cmd.split.people);
      const iou = c.account(cmd.split.iouAccountId);
      if (iou.row.kind !== 'IOU') throw new DomainError('NOT_IOU', 'Split must go to an IOU account');
      const note = `Split ${cmd.split.people} ways${cmd.note ? ` · ${cmd.note}` : ''}`;
      return [
        expense({ ...base, amount: mine, note }),
        transfer({ occurredAt, from: account, to: iou, amount: others, merchant: cmd.merchant, note }),
      ];
    }
    case 'INCOME': {
      const account = c.account(cmd.accountId);
      const envelope = cmd.envelopeId ? c.envelope(cmd.envelopeId) : c.defaultEnvelope(account.row);
      return [income({ occurredAt, account, envelope, categoryId: c.category(cmd.categoryId, 'INCOME').id, amount: cmd.amount, merchant: cmd.merchant, note: cmd.note })];
    }
    case 'TRANSFER': {
      const from = c.account(cmd.fromAccountId);
      const to = c.account(cmd.toAccountId);
      const txs = [transfer({
        occurredAt, from, to, amount: cmd.amount, toAmount: cmd.toAmount, note: cmd.note,
        fromEnvelope: cmd.fromEnvelopeId ? c.envelope(cmd.fromEnvelopeId) : undefined,
        toEnvelope: cmd.toEnvelopeId ? c.envelope(cmd.toEnvelopeId) : undefined,
      })];
      // The admin fee is its own expense, so it shows up in spending.
      if (cmd.fee) {
        const fees = c.categoryByName('Fees');
        if (!fees) throw new DomainError('NO_FEES_CATEGORY', 'Create a "Fees" expense category first');
        txs.push(expense({ occurredAt, account: from, envelope: c.defaultEnvelope(from.row), categoryId: fees.id, amount: cmd.fee, note: 'Transfer fee' }));
      }
      return txs;
    }
    case 'ALLOCATE':
      return [allocate({ occurredAt, from: c.envelope(cmd.fromEnvelopeId), to: c.envelope(cmd.toEnvelopeId), amount: cmd.amount, note: cmd.note })];
  }
}

export async function recordTransactions(deps: Deps, ws: string, cmds: Command[]): Promise<string[]> {
  const c = await catalogOf(deps, ws);
  const now = deps.now?.() ?? Date.now();
  const txs = cmds.flatMap(cmd => build(c, cmd, now));
  for (const tx of txs) assertBalanced(tx, id => c.currencyOf(id));
  return deps.ledger.insert(ws, txs);
}

export async function deleteTransaction(deps: Deps, ws: string, id: string): Promise<void> {
  if (!(await deps.ledger.softDelete(ws, id))) throw new DomainError('NOT_FOUND', 'Transaction not found');
}

export async function createAccount(deps: Deps, ws: string, i: {
  name: string; kind: string; provider?: string | null; currency?: string; dueDay?: number | null;
  defaultEnvelopeId?: string | null; openingBalance?: number; openingEnvelopeId?: string;
}): Promise<Account> {
  const c = await catalogOf(deps, ws);
  if (i.defaultEnvelopeId) c.envelope(i.defaultEnvelopeId);
  const account = await deps.catalog.createAccount(ws, {
    name: i.name.trim(), kind: i.kind, provider: i.provider?.trim().toUpperCase() || null, currency_code: i.currency ?? 'IDR',
    default_envelope_id: i.defaultEnvelopeId ?? null, due_day: i.dueDay ?? null,
  });
  // Opening balance is an INCOME in "Opening balance"; a card's or paylater's debt is negative.
  if (i.openingBalance) {
    const cat = c.categoryByName('Opening balance');
    if (!cat) throw new DomainError('NO_OPENING_CATEGORY', 'Create an "Opening balance" income category first');
    const envelope = i.openingEnvelopeId ? c.envelope(i.openingEnvelopeId) : c.defaultEnvelope(account);
    const tx = income({
      occurredAt: toOccurredAt(jakartaToday(deps.now?.()), deps.now?.()), account: { id: account.id, currency: account.currency_code },
      envelope, categoryId: cat.id, amount: i.openingBalance, signed: true, note: 'Opening balance',
    });
    await deps.ledger.insert(ws, [tx]);
  }
  return account;
}

export async function getBalances(deps: Deps, ws: string) {
  const [c, b] = await Promise.all([catalogOf(deps, ws), deps.ledger.balances(ws)]);
  return {
    accounts: c.accounts.filter(a => !a.archived_at).map(a => ({ ...a, balance: b.accounts[a.id] ?? 0 })),
    envelopes: c.envelopes.filter(e => !e.archived_at).map(e => ({ ...e, balance: b.envelopes[e.id] ?? 0 })),
  };
}

export async function setBudget(deps: Deps, ws: string, i: { categoryId?: string | null; envelopeId?: string | null; limit: number }) {
  if (!i.categoryId && !i.envelopeId) throw new DomainError('BUDGET_TARGET', 'Pick a category, an envelope, or both');
  if (!Number.isSafeInteger(i.limit) || i.limit <= 0) throw new DomainError('INVALID_AMOUNT');
  const c = await catalogOf(deps, ws);
  if (i.categoryId) c.category(i.categoryId, 'EXPENSE');
  if (i.envelopeId && c.envelope(i.envelopeId).kind !== 'SPENDING') throw new DomainError('BUDGET_ENVELOPE_KIND', 'Budgets attach to spending envelopes only');
  const w = await deps.catalog.getWorkspace(ws);
  const start = cycleStart(jakartaToday(deps.now?.()), w.cycle_start_day);
  return deps.catalog.setBudget(ws, { categoryId: i.categoryId ?? null, envelopeId: i.envelopeId ?? null }, i.limit, start);
}

export async function getBudgetStatus(deps: Deps, ws: string, day = jakartaToday(deps.now?.())) {
  const w = await deps.catalog.getWorkspace(ws);
  const from = cycleStart(day, w.cycle_start_day);
  const to = nextCycleStart(from, w.cycle_start_day);
  const today = jakartaToday(deps.now?.());
  const left = today >= from && today < to ? daysLeft(today, w.cycle_start_day) : 0;
  const budgets = await deps.catalog.listBudgets(ws);
  const rows = await Promise.all(budgets.map(async b => {
    const limit = b.limits.filter(l => l.effective_from <= from).sort((x, y) => y.effective_from.localeCompare(x.effective_from))[0]?.amount
      ?? b.limits[0]?.amount ?? 0;
    const spent = await deps.ledger.spent(ws, { categoryId: b.category_id, envelopeId: b.envelope_id, from, to });
    const remaining = limit - spent;
    return {
      id: b.id, categoryId: b.category_id, envelopeId: b.envelope_id, limit, spent, remaining,
      percent: limit ? Math.round((spent / limit) * 100) : 0,
      safePerDay: left > 0 ? Math.max(0, Math.floor(remaining / left)) : null,
    };
  }));
  return { cycle: { from, to, daysLeft: left }, budgets: rows };
}

export async function quickParse(deps: Deps, ws: string, text: string): Promise<Draft[]> {
  const [c, aliases, merchantHistory, lastAccountId] = await Promise.all([
    catalogOf(deps, ws), deps.catalog.listAliases(ws), deps.ledger.merchantHistory(ws), deps.ledger.lastAccountId(ws),
  ]);
  const accounts = c.accounts.filter(a => !a.archived_at);
  return parseQuickAdd(text, {
    today: jakartaToday(deps.now?.()),
    accounts,
    categories: c.categories.filter(x => !x.archived_at),
    aliases, merchantHistory,
    // Before any spending exists, default to the first everyday account.
    lastAccountId: lastAccountId ?? accounts.find(a => ['BANK', 'EWALLET', 'CASH'].includes(a.kind))?.id ?? null,
  });
}

/** Saves reviewed drafts; a merchant the user corrected is learned as an alias for next time. */
export async function quickSave(deps: Deps, ws: string, items: { command: Command; rawMerchant?: string; suggestedMerchant?: string }[]) {
  const ids = await recordTransactions(deps, ws, items.map(i => i.command));
  for (const i of items) {
    const merchant = 'merchant' in i.command ? i.command.merchant?.trim() : undefined;
    if (i.rawMerchant && merchant && i.suggestedMerchant !== undefined && merchant !== i.suggestedMerchant) {
      await deps.catalog.saveAlias(ws, { alias: i.rawMerchant.toLowerCase(), kind: 'MERCHANT', value: merchant });
    }
  }
  return ids;
}

export async function exportCsv(deps: Deps, ws: string): Promise<string> {
  const c = await catalogOf(deps, ws);
  const name = (rows: { id: string; name: string }[], id: string | null) => rows.find(r => r.id === id)?.name ?? '';
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['date,type,account,amount,currency,envelope,category,merchant,note'];
  let cursor: string | undefined;
  do {
    const page = await deps.ledger.list(ws, { limit: 500, cursor });
    for (const t of page.items) {
      const envelopes = t.allocations.map(a => name(c.envelopes, a.envelope_id)).join(' > ');
      // One row per account line; an ALLOCATE has none, so it gets one row per envelope line.
      const rows = t.entries.length
        ? t.entries.map(e => { const acc = c.accounts.find(a => a.id === e.account_id); return [acc?.name ?? '', e.amount, acc?.currency_code ?? '', envelopes]; })
        : t.allocations.map(a => { const env = c.envelopes.find(x => x.id === a.envelope_id); return ['', a.amount, env?.currency_code ?? '', env?.name ?? '']; });
      for (const [account, amount, currency, envelope] of rows) {
        lines.push([t.occurred_at, t.type, String(account), String(amount), String(currency), String(envelope), name(c.categories, t.category_id), t.merchant ?? '', t.note ?? ''].map(cell).join(','));
      }
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return lines.join('\n');
}

export const listTransactions = (deps: Deps, ws: string, f: TxFilter) => deps.ledger.list(ws, f);

/** PATCH for accounts, envelopes and categories: `archived` becomes a timestamp, and an envelope reference must be ours. */
export async function updateItem(deps: Deps, ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>) {
  const { archived, ...rest } = patch;
  if (typeof rest.default_envelope_id === 'string') (await catalogOf(deps, ws)).envelope(rest.default_envelope_id);
  if (typeof rest.provider === 'string') rest.provider = rest.provider.trim().toUpperCase() || null;
  if (archived !== undefined) rest.archived_at = archived ? new Date(deps.now?.() ?? Date.now()).toISOString() : null;
  if (!(await deps.catalog.update(ws, table, id, rest))) throw new DomainError('NOT_FOUND', 'Not found');
}
