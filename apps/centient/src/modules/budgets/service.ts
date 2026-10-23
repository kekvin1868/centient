// Budget use cases: set a limit for this cycle, see how much is left.
import type { ServiceDeps } from '../../context';
import { cycleStart, daysLeft, jakartaToday, nextCycleStart } from '../../domain/cycle';
import { DomainError } from '../../domain/ledger';

export function createBudgetsService({ ws, now, repos, catalog }: ServiceDeps) {
  return {
    async set(i: { categoryId?: string | null; envelopeId?: string | null; limit: number }) {
      if (!i.categoryId && !i.envelopeId) throw new DomainError('BUDGET_TARGET', 'Pick a category, an envelope, or both');
      if (!Number.isSafeInteger(i.limit) || i.limit <= 0) throw new DomainError('INVALID_AMOUNT');
      const c = await catalog.load();
      if (i.categoryId) c.category(i.categoryId, 'EXPENSE');
      if (i.envelopeId && c.envelope(i.envelopeId).kind !== 'SPENDING') throw new DomainError('BUDGET_ENVELOPE_KIND', 'Budgets attach to spending envelopes only');
      const w = await repos.workspaces.get(ws);
      const start = cycleStart(jakartaToday(now()), w.cycle_start_day);
      return repos.budgets.set(ws, { categoryId: i.categoryId ?? null, envelopeId: i.envelopeId ?? null }, i.limit, start);
    },

    async status(day = jakartaToday(now())) {
      const w = await repos.workspaces.get(ws);
      const from = cycleStart(day, w.cycle_start_day);
      const to = nextCycleStart(from, w.cycle_start_day);
      const today = jakartaToday(now());
      const left = today >= from && today < to ? daysLeft(today, w.cycle_start_day) : 0;
      const budgets = await repos.budgets.list(ws);
      const rows = await Promise.all(budgets.map(async b => {
        const limit = b.limits.filter(l => l.effective_from <= from).sort((x, y) => y.effective_from.localeCompare(x.effective_from))[0]?.amount
          ?? b.limits[0]?.amount ?? 0;
        const spent = await repos.entries.spent(ws, { categoryId: b.category_id, envelopeId: b.envelope_id, from, to });
        const remaining = limit - spent;
        return {
          id: b.id, categoryId: b.category_id, envelopeId: b.envelope_id, limit, spent, remaining,
          percent: limit ? Math.round((spent / limit) * 100) : 0,
          safePerDay: left > 0 ? Math.max(0, Math.floor(remaining / left)) : null,
        };
      }));
      return { cycle: { from, to, daysLeft: left }, budgets: rows };
    },

    async remove(id: string) {
      if (!(await repos.budgets.remove(ws, id))) throw new DomainError('NOT_FOUND', 'Budget not found');
    },
  };
}
