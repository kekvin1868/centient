// Account use cases: open, reconcile with the bank, change, delete.
import type { ServiceDeps } from '../../context';
import type { Patch } from '../../lib/schemas';
import { jakartaToday, toOccurredAt } from '../../domain/cycle';
import { assertBalanced, DomainError, expense, income, type NewTransaction } from '../../domain/ledger';
import type { Account } from '../../repos/accounts';

export function createAccountsService({ ws, now, repos, catalog }: ServiceDeps) {
  const stamp = () => new Date(now()).toISOString();

  return {
    /** Creates an account with its Main pocket; an opening balance (negative for card / pay later debt) goes into Main. */
    async create(i: { name: string; kind: string; provider?: string | null; currency?: string; dueDay?: number | null; openingBalance?: number }): Promise<Account> {
      const account = await repos.accounts.create(ws, {
        name: i.name.trim(), kind: i.kind, provider: i.provider?.trim().toUpperCase() || null, currency_code: i.currency ?? 'IDR', due_day: i.dueDay ?? null,
      });
      catalog.invalidate();
      // Opening balance is an INCOME in "Opening balance"; a card's or paylater's debt is negative.
      if (i.openingBalance) {
        const c = await catalog.load();
        const cat = c.categoryByName('Opening balance');
        if (!cat) throw new DomainError('NO_OPENING_CATEGORY', 'Create an "Opening balance" income category first');
        const tx = income({
          occurredAt: toOccurredAt(jakartaToday(now()), now()), account: { id: account.id, currency: account.currency_code },
          envelope: c.defaultEnvelope(account), categoryId: cat.id, amount: i.openingBalance, signed: true, note: 'Opening balance',
        });
        await repos.entries.insert(ws, [{ kind: 'OPENING', command: null, txs: [tx] }]);
      }
      return account;
    },

    /**
     * Sets an account to the balance the bank shows; the gap goes into or out of its Main pocket. On an account
     * with no entries yet this is its opening balance (first run, a new account). Otherwise the gap becomes
     * spending (or income) in `categoryId` when given, so budgets see it, else an uncategorised
     * "Balance adjustment" that budgets ignore.
     */
    async reconcile(accountId: string, i: { actual: number; categoryId?: string | null }) {
      if (!Number.isSafeInteger(i.actual)) throw new DomainError('INVALID_AMOUNT');
      const [c, b] = await Promise.all([catalog.load(), repos.entries.balances(ws)]);
      const account = c.account(accountId);
      const at = now();
      const diff = i.actual - (b.accounts[accountId] ?? 0);
      const opening = !(await repos.entries.hasTransactions(ws, accountId));
      const base = { occurredAt: toOccurredAt(jakartaToday(at), at), account, envelope: c.defaultEnvelope(account.row) };
      if (diff !== 0 && opening) {
        const cat = c.categoryByName('Opening balance');
        if (!cat) throw new DomainError('NO_OPENING_CATEGORY', 'Create an "Opening balance" income category first');
        const tx = income({ ...base, categoryId: cat.id, amount: diff, signed: true, note: 'Opening balance' });
        assertBalanced(tx, x => c.accountOf(x));
        await repos.entries.insert(ws, [{ kind: 'OPENING', command: null, txs: [tx] }]);
      } else if (diff !== 0) {
        const correction = { ...base, note: 'Balance correction' };
        let tx: NewTransaction;
        if (i.categoryId) {
          const cat = c.category(i.categoryId, diff < 0 ? 'EXPENSE' : 'INCOME');
          tx = diff < 0 ? expense({ ...correction, categoryId: cat.id, amount: -diff }) : income({ ...correction, categoryId: cat.id, amount: diff });
        } else {
          const cat = c.categories.find(x => x.name === 'Balance adjustment' && x.kind === 'INCOME');
          if (!cat) throw new DomainError('NO_ADJUSTMENT_CATEGORY', 'Create a "Balance adjustment" income category first');
          tx = income({ ...correction, categoryId: cat.id, amount: diff, signed: true });
        }
        assertBalanced(tx, x => c.accountOf(x));
        await repos.entries.insert(ws, [{ kind: 'CORRECTION', command: null, txs: [tx] }]);
      }
      const reconciledAt = new Date(at).toISOString();
      await repos.accounts.update(ws, accountId, { reconciled_at: reconciledAt });
      return { balance: i.actual, reconciled_at: reconciledAt };
    },

    /** PATCH: `archived` becomes a timestamp; a pocket reference must be ours; type and currency have locks. */
    async update(id: string, p: Patch) {
      const { archived, ...rest }: Record<string, unknown> = p;
      if (typeof rest.default_envelope_id === 'string') (await catalog.load()).envelope(rest.default_envelope_id);
      if (typeof rest.provider === 'string') rest.provider = rest.provider.trim().toUpperCase() || null;
      if (typeof rest.kind === 'string') {
        const row = (await repos.accounts.list(ws)).find(a => a.id === id);
        if (row && (row.kind === 'IOU') !== (rest.kind === 'IOU')) throw new DomainError('KIND_LOCKED', '"Friends owe you" accounts keep their type');
      }
      if (typeof rest.currency_code === 'string') {
        if (await repos.entries.hasTransactions(ws, id)) throw new DomainError('CURRENCY_LOCKED', 'This account already has entries. Add a new account for the other currency.');
        // Its pockets are empty too (no entries), so they simply follow the account's new currency.
        for (const e of (await repos.envelopes.list(ws)).filter(x => x.account_id === id)) {
          await repos.envelopes.update(ws, e.id, { currency_code: rest.currency_code });
        }
      }
      if (archived !== undefined) rest.archived_at = archived ? stamp() : null;
      if (!(await repos.accounts.update(ws, id, rest))) throw new DomainError('NOT_FOUND', 'Not found');
      catalog.invalidate();
    },

    async remove(id: string): Promise<void> {
      if (!(await repos.accounts.remove(ws, id, stamp()))) throw new DomainError('NOT_FOUND', 'Account not found');
      catalog.invalidate();
    },
  };
}
