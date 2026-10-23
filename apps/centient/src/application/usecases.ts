// Use cases. Each takes the workspace id from the verified session, never from the request body,
// and checks that every referenced account, envelope and category belongs to that workspace.
import { parseQuickAdd, type Draft, type QAContext } from '@centient/quickadd';
import { cycleStart, daysLeft, jakartaToday, nextCycleStart, toOccurredAt } from '../domain/cycle';
import {
  allocate, assertBalanced, DomainError, expense, income, splitShares, transfer,
  type AccountRef, type EnvelopeRef, type NewTransaction,
} from '../domain/ledger';
import type {
  Account, CatalogRepository, Category, EntryView, Envelope, FileStore, InstallmentRepository, LedgerRepository, NewEntry, Price, PriceRepository, TxFilter, TxView,
} from './ports';

export type Deps = {
  catalog: CatalogRepository; ledger: LedgerRepository; now?: () => number;
  /** Crypto prices; absent in tests that do not need them. */
  prices?: PriceRepository;
  /** Outbound HTTP (the price service); injectable so tests never touch the network. */
  fetch?: typeof fetch;
  installments?: InstallmentRepository;
  files?: FileStore;
};

export type Command =
  | { type: 'EXPENSE'; accountId: string; envelopeId?: string; categoryId: string; amount: number; date: string; merchant?: string; note?: string;
      split?: { people: number; iouAccountId?: string }; originalAmount?: number; originalCurrency?: string }
  | { type: 'INCOME'; accountId: string; envelopeId?: string; categoryId: string; amount: number; date: string; merchant?: string; note?: string }
  | { type: 'TRANSFER'; fromAccountId: string; toAccountId: string; amount: number; toAmount?: number;
      fromEnvelopeId?: string; toEnvelopeId?: string; fee?: number; date: string; note?: string }
  | { type: 'ALLOCATE'; fromEnvelopeId: string; toEnvelopeId: string; amount: number; date: string; note?: string };

/** Everything a workspace has, loaded once per request; lookups throw NOT_FOUND for foreign ids. */
export async function catalogOf(deps: Deps, ws: string) {
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
type Cat = Awaited<ReturnType<typeof catalogOf>>;

/**
 * A split bill needs an IOU account for what the others owe. New workspaces start without one, so the
 * first split creates "Friends owe you" (named Friends) and later splits reuse the first IOU account.
 */
async function withIou(deps: Deps, ws: string, c: Cat, cmds: Command[]): Promise<{ c: Cat; cmds: Command[] }> {
  if (!cmds.some(x => x.type === 'EXPENSE' && x.split && !x.split.iouAccountId)) return { c, cmds };
  let iou = c.accounts.find(a => a.kind === 'IOU' && !a.archived_at);
  if (!iou) {
    await deps.catalog.createAccount(ws, { name: 'Friends', kind: 'IOU', provider: null, currency_code: 'IDR', due_day: null });
    c = await catalogOf(deps, ws);
    iou = c.accounts.find(a => a.kind === 'IOU')!;
  }
  const id = iou.id;
  return { c, cmds: cmds.map(x => (x.type === 'EXPENSE' && x.split && !x.split.iouAccountId ? { ...x, split: { ...x.split, iouAccountId: id } } : x)) };
}

function build(c: Cat, cmd: Command, now: number): NewTransaction[] {
  const occurredAt = toOccurredAt(cmd.date, now);
  switch (cmd.type) {
    case 'EXPENSE': {
      const account = c.account(cmd.accountId);
      const envelope = c.pocketOf(account.row, cmd.envelopeId);
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
        transfer({ occurredAt, from: account, to: iou, amount: others, merchant: cmd.merchant, note, fromEnvelope: envelope, toEnvelope: c.defaultEnvelope(iou.row) }),
      ];
    }
    case 'INCOME': {
      const account = c.account(cmd.accountId);
      const envelope = c.pocketOf(account.row, cmd.envelopeId);
      return [income({ occurredAt, account, envelope, categoryId: c.category(cmd.categoryId, 'INCOME').id, amount: cmd.amount, merchant: cmd.merchant, note: cmd.note })];
    }
    case 'TRANSFER': {
      const from = c.account(cmd.fromAccountId);
      const to = c.account(cmd.toAccountId);
      const fromEnvelope = c.pocketOf(from.row, cmd.fromEnvelopeId);
      const txs = [transfer({
        occurredAt, from, to, amount: cmd.amount, toAmount: cmd.toAmount, note: cmd.note,
        fromEnvelope, toEnvelope: c.pocketOf(to.row, cmd.toEnvelopeId),
      })];
      // The admin fee is its own expense, so it shows up in spending.
      if (cmd.fee) {
        const fees = c.categoryByName('Fees');
        if (!fees) throw new DomainError('NO_FEES_CATEGORY', 'Create a "Fees" expense category first');
        txs.push(expense({ occurredAt, account: from, envelope: fromEnvelope, categoryId: fees.id, amount: cmd.fee, note: 'Transfer fee' }));
      }
      return txs;
    }
    case 'ALLOCATE':
      return [allocate({ occurredAt, from: c.envelope(cmd.fromEnvelopeId), to: c.envelope(cmd.toEnvelopeId), amount: cmd.amount, note: cmd.note })];
  }
}

/** Saves each command as one entry (a split or a fee adds a second transaction to it); returns the entry ids. */
export async function recordTransactions(deps: Deps, ws: string, cmds: Command[]): Promise<string[]> {
  const r = await withIou(deps, ws, await catalogOf(deps, ws), cmds);
  const c = r.c;
  const now = deps.now?.() ?? Date.now();
  const entries: NewEntry[] = r.cmds.map(cmd => ({ kind: 'USER', command: cmd, txs: build(c, cmd, now) }));
  for (const e of entries) for (const tx of e.txs) assertBalanced(tx, id => c.accountOf(id));
  return deps.ledger.insert(ws, entries);
}

/** Rebuilds an entry from an edited command. Its type is fixed; a same-day edit keeps the original time. */
export async function editEntry(deps: Deps, ws: string, id: string, cmd: Command): Promise<void> {
  const entry = await deps.ledger.getEntry(ws, id);
  if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
  if (entry.kind !== 'USER') throw new DomainError('NOT_EDITABLE', 'Use Update balance to change this');
  if (commandOf(entry)?.type !== cmd.type) throw new DomainError('TYPE_LOCKED', 'An entry keeps its type. Delete it and add a new one instead.');
  const r = await withIou(deps, ws, await catalogOf(deps, ws), [cmd]);
  const c = r.c;
  const txs = build(c, r.cmds[0], deps.now?.() ?? Date.now());
  if (cmd.date === entry.occurred_at.slice(0, 10)) for (const t of txs) t.occurredAt = entry.occurred_at;
  for (const tx of txs) assertBalanced(tx, x => c.accountOf(x));
  await deps.ledger.replace(ws, id, r.cmds[0], txs);
}

export async function deleteEntry(deps: Deps, ws: string, id: string): Promise<void> {
  if (!(await deps.ledger.deleteEntry(ws, id))) throw new DomainError('NOT_FOUND', 'Entry not found');
}

export async function listEntries(deps: Deps, ws: string, f: TxFilter) {
  const page = await deps.ledger.listEntries(ws, f);
  return { ...page, items: page.items.map(e => ({ ...e, command: commandOf(e) })) };
}

/** The saved command, or one read back from a single transaction saved before entries existed. */
function commandOf(e: EntryView): Command | null {
  if (e.command) return e.command as Command;
  return e.kind === 'USER' && e.transactions.length === 1 ? commandFromTx(e.transactions[0]) : null;
}

function commandFromTx(t: TxView): Command | null {
  const date = t.occurred_at.slice(0, 10);
  const note = t.note ?? undefined;
  const out = <T>(rows: T[], pick: (r: T) => number) => rows.find(r => pick(r) < 0);
  const inn = <T>(rows: T[], pick: (r: T) => number) => rows.find(r => pick(r) > 0);
  switch (t.type) {
    case 'EXPENSE':
    case 'INCOME': {
      const [e] = t.entries, [a] = t.allocations;
      if (!e || !a || !t.category_id) return null;
      return {
        type: t.type, accountId: e.account_id, envelopeId: a.envelope_id, categoryId: t.category_id, amount: Math.abs(e.amount), date,
        merchant: t.merchant ?? undefined, note,
        ...(t.type === 'EXPENSE' && t.original_amount ? { originalAmount: t.original_amount, originalCurrency: t.original_currency ?? undefined } : {}),
      };
    }
    case 'TRANSFER': {
      const from = out(t.entries, x => x.amount), to = inn(t.entries, x => x.amount);
      if (!from || !to) return null;
      return {
        type: 'TRANSFER', fromAccountId: from.account_id, toAccountId: to.account_id, amount: -from.amount,
        toAmount: to.amount !== -from.amount ? to.amount : undefined, date, note,
        fromEnvelopeId: out(t.allocations, x => x.amount)?.envelope_id, toEnvelopeId: inn(t.allocations, x => x.amount)?.envelope_id,
      };
    }
    case 'ALLOCATE': {
      const from = out(t.allocations, x => x.amount), to = inn(t.allocations, x => x.amount);
      if (!from || !to) return null;
      return { type: 'ALLOCATE', fromEnvelopeId: from.envelope_id, toEnvelopeId: to.envelope_id, amount: -from.amount, date, note };
    }
  }
  return null;
}

/**
 * Sets an account to the balance the bank shows; the gap goes into or out of its Main pocket. On an account
 * with no entries yet this is its opening balance (first run, a new account). Otherwise the gap becomes
 * spending (or income) in `categoryId` when given, so budgets see it, else an uncategorised
 * "Balance adjustment" that budgets ignore.
 */
export async function updateBalance(deps: Deps, ws: string, accountId: string, i: { actual: number; categoryId?: string | null }) {
  if (!Number.isSafeInteger(i.actual)) throw new DomainError('INVALID_AMOUNT');
  const [c, b] = await Promise.all([catalogOf(deps, ws), deps.ledger.balances(ws)]);
  const account = c.account(accountId);
  const now = deps.now?.() ?? Date.now();
  const diff = i.actual - (b.accounts[accountId] ?? 0);
  const opening = !(await deps.ledger.hasTransactions(ws, accountId));
  if (diff !== 0 && opening) {
    const cat = c.categoryByName('Opening balance');
    if (!cat) throw new DomainError('NO_OPENING_CATEGORY', 'Create an "Opening balance" income category first');
    const tx = income({ occurredAt: toOccurredAt(jakartaToday(now), now), account, envelope: c.defaultEnvelope(account.row), categoryId: cat.id, amount: diff, signed: true, note: 'Opening balance' });
    assertBalanced(tx, x => c.accountOf(x));
    await deps.ledger.insert(ws, [{ kind: 'OPENING', command: null, txs: [tx] }]);
  } else if (diff !== 0) {
    const base = { occurredAt: toOccurredAt(jakartaToday(now), now), account, envelope: c.defaultEnvelope(account.row), note: 'Balance correction' };
    let tx: NewTransaction;
    if (i.categoryId) {
      const cat = c.category(i.categoryId, diff < 0 ? 'EXPENSE' : 'INCOME');
      tx = diff < 0 ? expense({ ...base, categoryId: cat.id, amount: -diff }) : income({ ...base, categoryId: cat.id, amount: diff });
    } else {
      const cat = c.categories.find(x => x.name === 'Balance adjustment' && x.kind === 'INCOME');
      if (!cat) throw new DomainError('NO_ADJUSTMENT_CATEGORY', 'Create a "Balance adjustment" income category first');
      tx = income({ ...base, categoryId: cat.id, amount: diff, signed: true });
    }
    assertBalanced(tx, x => c.accountOf(x));
    await deps.ledger.insert(ws, [{ kind: 'CORRECTION', command: null, txs: [tx] }]);
  }
  const reconciledAt = new Date(now).toISOString();
  await deps.catalog.update(ws, 'accounts', accountId, { reconciled_at: reconciledAt });
  return { balance: i.actual, reconciled_at: reconciledAt };
}

/** Creates an account with its Main pocket; an opening balance (negative for card / pay later debt) goes into Main. */
export async function createAccount(deps: Deps, ws: string, i: {
  name: string; kind: string; provider?: string | null; currency?: string; dueDay?: number | null; openingBalance?: number;
}): Promise<Account> {
  const account = await deps.catalog.createAccount(ws, {
    name: i.name.trim(), kind: i.kind, provider: i.provider?.trim().toUpperCase() || null, currency_code: i.currency ?? 'IDR', due_day: i.dueDay ?? null,
  });
  // Opening balance is an INCOME in "Opening balance"; a card's or paylater's debt is negative.
  if (i.openingBalance) {
    const c = await catalogOf(deps, ws);
    const cat = c.categoryByName('Opening balance');
    if (!cat) throw new DomainError('NO_OPENING_CATEGORY', 'Create an "Opening balance" income category first');
    const envelope = c.defaultEnvelope(account);
    const tx = income({
      occurredAt: toOccurredAt(jakartaToday(deps.now?.()), deps.now?.()), account: { id: account.id, currency: account.currency_code },
      envelope, categoryId: cat.id, amount: i.openingBalance, signed: true, note: 'Opening balance',
    });
    await deps.ledger.insert(ws, [{ kind: 'OPENING', command: null, txs: [tx] }]);
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

/** Everything the quick-add parser needs, so the client can preview drafts while typing. */
export async function quickContext(deps: Deps, ws: string): Promise<QAContext> {
  const [c, aliases, merchantHistory, lastAccountId] = await Promise.all([
    catalogOf(deps, ws), deps.catalog.listAliases(ws), deps.ledger.merchantHistory(ws), deps.ledger.lastAccountId(ws),
  ]);
  const accounts = c.accounts.filter(a => !a.archived_at);
  return {
    today: jakartaToday(deps.now?.()),
    accounts,
    categories: c.categories.filter(x => !x.archived_at),
    aliases, merchantHistory,
    // Before any spending exists, default to the first everyday account.
    lastAccountId: lastAccountId ?? accounts.find(a => ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH'].includes(a.kind))?.id ?? null,
  };
}

export async function quickParse(deps: Deps, ws: string, text: string): Promise<Draft[]> {
  return parseQuickAdd(text, await quickContext(deps, ws));
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

export async function deleteAccount(deps: Deps, ws: string, id: string): Promise<void> {
  const now = new Date(deps.now?.() ?? Date.now()).toISOString();
  if (!(await deps.catalog.deleteAccount(ws, id, now))) throw new DomainError('NOT_FOUND', 'Account not found');
}

/** Everything in the workspace as one JSON document: what a backup download contains. */
export async function backup(deps: Deps, ws: string) {
  const [workspace, accounts, envelopes, categories, budgets, aliases] = await Promise.all([
    deps.catalog.getWorkspace(ws), deps.catalog.listAccounts(ws), deps.catalog.listEnvelopes(ws),
    deps.catalog.listCategories(ws), deps.catalog.listBudgets(ws), deps.catalog.listAliases(ws),
  ]);
  const entries = [];
  let cursor: string | undefined;
  do {
    const page = await listEntries(deps, ws, { limit: 200, cursor });
    entries.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { format: 'centient-backup', version: 1, exported_at: new Date(deps.now?.() ?? Date.now()).toISOString(), workspace, accounts, envelopes, categories, budgets, aliases, entries };
}

/** Soft-deletes the workspace; the next request creates a fresh, seeded one. */
export async function resetWorkspace(deps: Deps, ws: string): Promise<void> {
  await deps.catalog.resetWorkspace(ws, new Date(deps.now?.() ?? Date.now()).toISOString());
}

/** Adds a pocket to an account (in the account's currency). Pocket names are unique within an account. */
export async function createPocket(deps: Deps, ws: string, i: { accountId: string; name: string; kind: Envelope['kind']; targetAmount?: number | null; targetDate?: string | null; color?: string | null }) {
  const c = await catalogOf(deps, ws);
  const account = c.account(i.accountId).row;
  if (account.kind === 'IOU') throw new DomainError('IOU_POCKETS', 'What friends owe you has no pockets');
  if ((i.kind === 'GOAL') !== Boolean(i.targetAmount)) throw new DomainError('GOAL_TARGET', 'A goal needs a target amount; other kinds must not have one');
  // The first pattern no live pocket of this account has (24 kinds; past that they repeat).
  const taken = new Set(c.envelopes.filter(e => e.account_id === account.id && !e.archived_at).map(e => e.pattern));
  const pattern = Array.from({ length: 24 }, (_, k) => k).find(k => !taken.has(k)) ?? taken.size % 24;
  return deps.catalog.createEnvelope(ws, {
    account_id: account.id, name: i.name.trim(), currency_code: account.currency_code, kind: i.kind,
    target_amount: i.kind === 'GOAL' ? i.targetAmount ?? null : null, target_date: i.kind === 'GOAL' ? i.targetDate ?? null : null,
    color: i.color ?? null, pattern,
  });
}

/**
 * Sets an entry's icon (one emoji; null = back to its category's). With `forMerchant`, the icon is also
 * remembered for the entry's merchant, so later entries there show it too.
 */
export async function setEntryIcon(deps: Deps, ws: string, id: string, i: { icon: string | null; forMerchant: boolean }) {
  const icon = i.icon?.trim() || null;
  if (icon && (!/\p{Extended_Pictographic}/u.test(icon) || [...new Intl.Segmenter().segment(icon)].length !== 1)) {
    throw new DomainError('NOT_AN_EMOJI', 'Pick one emoji');
  }
  const entry = await deps.ledger.getEntry(ws, id);
  if (!entry) throw new DomainError('NOT_FOUND', 'Entry not found');
  const merchant = i.forMerchant ? entry.transactions.find(t => t.merchant)?.merchant ?? null : null;
  await deps.ledger.setIcon(ws, id, icon, merchant);
}

// Looked up by name by the app itself (transfer fees, opening balances, balance corrections).
const BUILT_IN_CATEGORIES = ['Fees', 'Opening balance', 'Balance adjustment'];

/** Deletes a category (soft): its entries, budgets and quick-add words move to `moveTo` (same kind) first. */
export async function deleteCategory(deps: Deps, ws: string, id: string, moveTo: string) {
  const c = await catalogOf(deps, ws);
  const cat = c.categories.find(x => x.id === id);
  if (!cat) throw new DomainError('NOT_FOUND', 'Category not found');
  if (BUILT_IN_CATEGORIES.includes(cat.name)) throw new DomainError('BUILT_IN', `${cat.name} is used by the app and can't be deleted`);
  if (moveTo === id) throw new DomainError('SAME_CATEGORY', 'Pick another category for its entries');
  c.category(moveTo, cat.kind);
  await deps.catalog.deleteCategory(ws, id, moveTo, new Date(deps.now?.() ?? Date.now()).toISOString());
}

/** PATCH for accounts, envelopes and categories: `archived` becomes a timestamp, and an envelope reference must be ours. */
export async function updateItem(deps: Deps, ws: string, table: 'accounts' | 'envelopes' | 'categories', id: string, patch: Record<string, unknown>) {
  const { archived, ...rest } = patch;
  if (typeof rest.default_envelope_id === 'string') (await catalogOf(deps, ws)).envelope(rest.default_envelope_id);
  // A pocket hides only when empty (its money would vanish from view), and Main never.
  if (table === 'envelopes' && archived) {
    const [c, b] = await Promise.all([catalogOf(deps, ws), deps.ledger.balances(ws)]);
    if (c.accounts.some(a => a.default_envelope_id === id)) throw new DomainError('MAIN_POCKET', 'Main is where the account\'s money lives; it stays');
    if (b.envelopes[id]) throw new DomainError('POCKET_NOT_EMPTY', 'Move the money out of this pocket first');
  }
  if (typeof rest.provider === 'string') rest.provider = rest.provider.trim().toUpperCase() || null;
  if (table === 'accounts' && typeof rest.kind === 'string') {
    const row = (await deps.catalog.listAccounts(ws)).find(a => a.id === id);
    if (row && (row.kind === 'IOU') !== (rest.kind === 'IOU')) throw new DomainError('KIND_LOCKED', '"Friends owe you" accounts keep their type');
  }
  if (table === 'accounts' && typeof rest.currency_code === 'string') {
    if (await deps.ledger.hasTransactions(ws, id)) throw new DomainError('CURRENCY_LOCKED', 'This account already has entries. Add a new account for the other currency.');
    // Its pockets are empty too (no entries), so they simply follow the account's new currency.
    for (const e of (await deps.catalog.listEnvelopes(ws)).filter(x => x.account_id === id)) {
      await deps.catalog.update(ws, 'envelopes', e.id, { currency_code: rest.currency_code });
    }
  }
  if (archived !== undefined) rest.archived_at = archived ? new Date(deps.now?.() ?? Date.now()).toISOString() : null;
  if (!(await deps.catalog.update(ws, table, id, rest))) throw new DomainError('NOT_FOUND', 'Not found');
}

// CoinGecko ids for the crypto currencies we can price. Fiat (USD) is not priced: no free, keyless source we trust.
const COINGECKO: Record<string, string> = { BTC: 'bitcoin', USDT: 'tether' };
const PRICE_TTL_MS = 10 * 60_000;

/**
 * Rupiah prices for the crypto currencies this workspace's accounts hold. Served from the last saved price
 * when it is under 10 minutes old; otherwise refreshed from CoinGecko. If that fails (offline, rate limit),
 * the last saved price is returned with its time, so the client can show "as of" instead of nothing.
 * ponytail: CoinGecko's free tier allows ~30 calls/minute; one shared row per coin keeps us far under it.
 * Add an API key (or a second source) only if prices go missing.
 */
export async function getPrices(deps: Deps, ws: string): Promise<Record<string, { idrPerUnit: number; fetchedAt: string }>> {
  if (!deps.prices) return {};
  const held = [...new Set((await deps.catalog.listAccounts(ws)).filter(a => !a.archived_at).map(a => a.currency_code))].filter(c => COINGECKO[c]);
  const now = deps.now?.() ?? Date.now();
  let rows = await deps.prices.get(held);
  const stale = held.filter(c => { const r = rows.find(x => x.currency_code === c); return !r || now - Date.parse(r.fetched_at) > PRICE_TTL_MS; });
  if (stale.length) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=idr&ids=${stale.map(c => COINGECKO[c]).join(',')}`;
      const res = await (deps.fetch ?? fetch)(url, { headers: { accept: 'application/json', 'user-agent': 'Centient/1.0 (personal finance app)' }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`price service ${res.status}`);
      const body = await res.json() as Record<string, { idr?: number }>;
      const at = new Date(now).toISOString();
      const fresh: Price[] = stale.flatMap(c => { const idr = body[COINGECKO[c]]?.idr; return idr && idr > 0 ? [{ currency_code: c, idr_per_unit: Math.round(idr), fetched_at: at }] : []; });
      await deps.prices.save(fresh);
      rows = [...rows.filter(r => !fresh.some(f => f.currency_code === r.currency_code)), ...fresh];
    } catch (e) {
      console.warn('price refresh failed; serving last known prices', e);
    }
  }
  return Object.fromEntries(rows.map(r => [r.currency_code, { idrPerUnit: r.idr_per_unit, fetchedAt: r.fetched_at }]));
}
