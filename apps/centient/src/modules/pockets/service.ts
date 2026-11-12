// Pocket use cases: add a pocket to an account, change or hide it.
import type { ServiceDeps } from '../../context';
import type { Patch } from '../../lib/schemas';
import { addDays, cyclesIn, jakartaToday } from '../../domain/cycle';
import { DomainError } from '../../domain/ledger';
import { commandOf } from '../../lib/entryCommand';
import type { Envelope } from '../../repos/envelopes';

export type GoalState = 'ON_THE_WAY' | 'REACHED' | 'PAST_TARGET_DATE';

/**
 * How a goal stands today. Reached wins over a passed date; a date before today is past (Q35, Q36). `cyclesLeft`
 * counts the running cycle through the one holding the target date; the money still needed is spread over them.
 */
export function goalOutlook(g: {
  balance: number;
  target: number;
  targetDate: string | null;
  today: string;
  startDay: number;
}) {
  const progress = Math.floor((g.balance / g.target) * 100); // floor: 99.6% is not yet 100%
  const state: GoalState =
    g.balance >= g.target
      ? 'REACHED'
      : g.targetDate && g.targetDate < g.today
        ? 'PAST_TARGET_DATE'
        : 'ON_THE_WAY';
  const cyclesLeft =
    state === 'ON_THE_WAY' && g.targetDate
      ? cyclesIn(g.today, addDays(g.targetDate, 1), g.startDay).length
      : null;
  const neededPerCycle = cyclesLeft ? Math.ceil((g.target - g.balance) / cyclesLeft) : null;
  return { progress, state, cyclesLeft, neededPerCycle };
}

export function createPocketsService({ ws, now, repos, catalog }: ServiceDeps) {
  return {
    /** Adds a pocket to an account (in the account's currency). Pocket names are unique within an account. */
    async create(i: {
      accountId: string;
      name: string;
      kind: Envelope['kind'];
      targetAmount?: number | null;
      targetDate?: string | null;
      color?: string | null;
    }) {
      const c = await catalog.load();
      const account = c.account(i.accountId).row;
      if (account.kind === 'IOU')
        throw new DomainError('IOU_POCKETS', 'What friends owe you has no pockets');
      if ((i.kind === 'GOAL') !== Boolean(i.targetAmount))
        throw new DomainError(
          'GOAL_TARGET',
          'A goal needs a target amount; other kinds must not have one',
        );
      // The first pattern no live pocket of this account has (24 kinds; past that they repeat).
      const taken = new Set(
        c.envelopes.filter(e => e.account_id === account.id && !e.archived_at).map(e => e.pattern),
      );
      const pattern =
        Array.from({ length: 24 }, (_, k) => k).find(k => !taken.has(k)) ?? taken.size % 24;
      const pocket = await repos.envelopes.create(ws, {
        account_id: account.id,
        name: i.name.trim(),
        currency_code: account.currency_code,
        kind: i.kind,
        target_amount: i.kind === 'GOAL' ? (i.targetAmount ?? null) : null,
        target_date: i.kind === 'GOAL' ? (i.targetDate ?? null) : null,
        color: i.color ?? null,
        pattern,
      });
      catalog.invalidate();
      return pocket;
    },

    /** A goal's movements (50 a page, balance after each) and how it stands: progress, state, needed per cycle. */
    async activity(id: string, cursor?: string) {
      const c = await catalog.load();
      const p = c.envelopes.find(e => e.id === id);
      if (!p) throw new DomainError('NOT_FOUND', 'Pocket not found');
      if (p.kind !== 'GOAL' || !p.target_amount)
        throw new DomainError('NOT_A_GOAL', 'Only a goal has an activity log');
      const [w, log] = await Promise.all([
        repos.workspaces.get(ws),
        repos.entries.pocketLog(ws, id, cursor, 50),
      ]);
      const { balance } = log;
      const goal = {
        currency: p.currency_code,
        balance,
        target: p.target_amount,
        targetDate: p.target_date,
        ...goalOutlook({
          balance,
          target: p.target_amount,
          targetDate: p.target_date,
          today: jakartaToday(now()),
          startDay: w.cycle_start_day,
        }),
      };
      return {
        goal,
        items: log.items.map(e => ({ ...e, command: commandOf(e) })),
        nextCursor: log.nextCursor,
      };
    },

    /** PATCH: a pocket hides only when empty (its money would vanish from view), and Main never. */
    async update(id: string, p: Omit<Patch, 'kind'> & { kind?: 'SPENDING' | 'SAVINGS' }) {
      const { archived, ...rest }: Record<string, unknown> = p;
      if (p.kind) {
        const c = await catalog.load();
        const e = c.envelopes.find(x => x.id === id);
        if (!e) throw new DomainError('NOT_FOUND', 'Not found');
        if (e.kind === 'GOAL' || c.accounts.some(a => a.default_envelope_id === id))
          throw new DomainError('POCKET_KIND', 'Only a Spending or Savings pocket can switch');
        // A budget sits only on a Spending pocket (budgets service): keep that true.
        if (p.kind === 'SAVINGS' && (await repos.budgets.list(ws)).some(b => b.envelope_id === id))
          throw new DomainError('POCKET_HAS_BUDGET', 'This pocket has a budget; remove it first');
      }
      if (archived) {
        const [c, b] = await Promise.all([catalog.load(), repos.entries.balances(ws)]);
        if (c.accounts.some(a => a.default_envelope_id === id))
          throw new DomainError('MAIN_POCKET', "Main is where the account's money lives; it stays");
        if (b.envelopes[id])
          throw new DomainError('POCKET_NOT_EMPTY', 'Move the money out of this pocket first');
      }
      if (archived !== undefined)
        rest.archived_at = archived ? new Date(now()).toISOString() : null;
      if (!(await repos.envelopes.update(ws, id, rest)))
        throw new DomainError('NOT_FOUND', 'Not found');
      catalog.invalidate();
    },
  };
}
