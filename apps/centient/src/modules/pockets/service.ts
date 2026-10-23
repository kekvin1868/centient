// Pocket use cases: add a pocket to an account, change or hide it.
import type { ServiceDeps } from '../../context';
import type { Patch } from '../../lib/schemas';
import { DomainError } from '../../domain/ledger';
import type { Envelope } from '../../repos/envelopes';

export function createPocketsService({ ws, now, repos, catalog }: ServiceDeps) {
  return {
    /** Adds a pocket to an account (in the account's currency). Pocket names are unique within an account. */
    async create(i: { accountId: string; name: string; kind: Envelope['kind']; targetAmount?: number | null; targetDate?: string | null; color?: string | null }) {
      const c = await catalog.load();
      const account = c.account(i.accountId).row;
      if (account.kind === 'IOU') throw new DomainError('IOU_POCKETS', 'What friends owe you has no pockets');
      if ((i.kind === 'GOAL') !== Boolean(i.targetAmount)) throw new DomainError('GOAL_TARGET', 'A goal needs a target amount; other kinds must not have one');
      // The first pattern no live pocket of this account has (24 kinds; past that they repeat).
      const taken = new Set(c.envelopes.filter(e => e.account_id === account.id && !e.archived_at).map(e => e.pattern));
      const pattern = Array.from({ length: 24 }, (_, k) => k).find(k => !taken.has(k)) ?? taken.size % 24;
      const pocket = await repos.envelopes.create(ws, {
        account_id: account.id, name: i.name.trim(), currency_code: account.currency_code, kind: i.kind,
        target_amount: i.kind === 'GOAL' ? i.targetAmount ?? null : null, target_date: i.kind === 'GOAL' ? i.targetDate ?? null : null,
        color: i.color ?? null, pattern,
      });
      catalog.invalidate();
      return pocket;
    },

    /** PATCH: a pocket hides only when empty (its money would vanish from view), and Main never. */
    async update(id: string, p: Patch) {
      const { archived, ...rest }: Record<string, unknown> = p;
      if (archived) {
        const [c, b] = await Promise.all([catalog.load(), repos.entries.balances(ws)]);
        if (c.accounts.some(a => a.default_envelope_id === id)) throw new DomainError('MAIN_POCKET', 'Main is where the account\'s money lives; it stays');
        if (b.envelopes[id]) throw new DomainError('POCKET_NOT_EMPTY', 'Move the money out of this pocket first');
      }
      if (archived !== undefined) rest.archived_at = archived ? new Date(now()).toISOString() : null;
      if (!(await repos.envelopes.update(ws, id, rest))) throw new DomainError('NOT_FOUND', 'Not found');
      catalog.invalidate();
    },
  };
}
