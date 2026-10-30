// Budget use cases: set a limit for this cycle in one currency, see how much is left and where it is heading.
import type { ServiceDeps } from '../../context';
import { cycleStart, daysLeft, jakartaToday, nextCycleStart } from '../../domain/cycle';
import { daysBetween, forecast } from '../../domain/forecast';
import { DomainError } from '../../domain/ledger';

export function createBudgetsService({ ws, now, repos, catalog }: ServiceDeps) {
  return {
    /** A pocket budget is in the pocket's currency; a category-only one in the one asked for (rupiah by default). */
    async set(i: { categoryId?: string | null; envelopeId?: string | null; currency?: string; limit: number }) {
      if (!i.categoryId && !i.envelopeId) throw new DomainError('BUDGET_TARGET', 'Pick a category, an envelope, or both');
      if (!Number.isSafeInteger(i.limit) || i.limit <= 0) throw new DomainError('INVALID_AMOUNT');
      const c = await catalog.load();
      if (i.categoryId) c.category(i.categoryId, 'EXPENSE');
      const envelope = i.envelopeId ? c.envelope(i.envelopeId) : null;
      if (envelope && envelope.kind !== 'SPENDING') throw new DomainError('BUDGET_ENVELOPE_KIND', 'Budgets attach to spending envelopes only');
      if (envelope && i.currency && i.currency !== envelope.currency) {
        throw new DomainError('BUDGET_CURRENCY', `This pocket holds ${envelope.currency}, so its budget is in ${envelope.currency}`);
      }
      const currency = envelope?.currency ?? i.currency ?? 'IDR';
      const w = await repos.workspaces.get(ws);
      const start = cycleStart(jakartaToday(now()), w.cycle_start_day);
      return repos.budgets.set(ws, { categoryId: i.categoryId ?? null, envelopeId: i.envelopeId ?? null, currency }, i.limit, start);
    },

    /** Each budget in the cycle holding `day`; the forecast only for the running cycle (`projected` null otherwise). */
    async status(day = jakartaToday(now())) {
      const w = await repos.workspaces.get(ws);
      const from = cycleStart(day, w.cycle_start_day);
      const to = nextCycleStart(from, w.cycle_start_day);
      const today = jakartaToday(now());
      const running = today >= from && today < to;
      const left = running ? daysLeft(today, w.cycle_start_day) : 0;
      const cycleDays = daysBetween(from, to);
      const daysGone = running ? daysBetween(from, today) + 1 : null;
      const budgets = await repos.budgets.list(ws);
      const rows = await Promise.all(budgets.map(async b => {
        const limit = b.limits.filter(l => l.effective_from <= from).sort((x, y) => y.effective_from.localeCompare(x.effective_from))[0]?.amount
          ?? b.limits[0]?.amount ?? 0;
        const spent = await repos.entries.spent(ws, { categoryId: b.category_id, envelopeId: b.envelope_id, currency: b.currency_code, from, to });
        const remaining = limit - spent;
        return {
          id: b.id, categoryId: b.category_id, envelopeId: b.envelope_id, currency: b.currency_code, limit, spent, remaining,
          percent: limit ? Math.round((spent / limit) * 100) : 0,
          safePerDay: left > 0 ? Math.max(0, Math.floor(remaining / left)) : null,
          daysGone, cycleDays, ...forecast(spent, limit, cycleDays, daysGone),
        };
      }));
      return { cycle: { from, to, daysLeft: left }, budgets: rows };
    },

    async remove(id: string) {
      if (!(await repos.budgets.remove(ws, id))) throw new DomainError('NOT_FOUND', 'Budget not found');
    },
  };
}
