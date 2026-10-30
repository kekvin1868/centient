// Budget use cases: set a limit for this cycle (or for a fixed run of days) in one currency, see how much is left
// and where it is heading, and look back at temporary budgets that ended.
import type { ServiceDeps } from '../../context';
import { addDays, cycleStart, daysLeft, jakartaToday, nextCycleStart } from '../../domain/cycle';
import { daysBetween, forecast } from '../../domain/forecast';
import { DomainError } from '../../domain/ledger';
import type { Budget } from '../../repos/budgets';

type SetBudget = { categoryId?: string | null; envelopeId?: string | null; currency?: string; limit: number; startsOn?: string; days?: number; id?: string };

// "Nov 10" in messages, as the screens write dates.
const short = (day: string) => new Date(Date.parse(day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const temporary = (b: Budget): b is Budget & { starts_on: string; ends_on: string } => b.starts_on !== null && b.ends_on !== null;

export function createBudgetsService({ ws, now, repos, catalog }: ServiceDeps) {
  const spentIn = (b: Budget, from: string, to: string) =>
    repos.entries.spent(ws, { categoryId: b.category_id, envelopeId: b.envelope_id, currency: b.currency_code, from, to });

  return {
    /**
     * A pocket budget is in the pocket's currency; a category-only one in the one asked for (rupiah by default).
     * With `startsOn` and `days` it is a temporary budget: today or later, 2 to 90 days, not overlapping another
     * temporary one on the same target. With `id` it changes that temporary budget's limit and length (its start stays).
     */
    async set(i: SetBudget) {
      if (!i.categoryId && !i.envelopeId) throw new DomainError('BUDGET_TARGET', 'Pick a category, an envelope, or both');
      if (!Number.isSafeInteger(i.limit) || i.limit <= 0) throw new DomainError('INVALID_AMOUNT');
      const c = await catalog.load();
      const category = i.categoryId ? c.category(i.categoryId, 'EXPENSE') : null;
      const envelope = i.envelopeId ? c.envelope(i.envelopeId) : null;
      if (envelope && envelope.kind !== 'SPENDING') throw new DomainError('BUDGET_ENVELOPE_KIND', 'Budgets attach to spending envelopes only');
      if (envelope && i.currency && i.currency !== envelope.currency) {
        throw new DomainError('BUDGET_CURRENCY', `This pocket holds ${envelope.currency}, so its budget is in ${envelope.currency}`);
      }
      const t = { categoryId: i.categoryId ?? null, envelopeId: i.envelopeId ?? null, currency: envelope?.currency ?? i.currency ?? 'IDR' };
      const today = jakartaToday(now());
      if (i.startsOn === undefined && i.days === undefined) {
        const w = await repos.workspaces.get(ws);
        return repos.budgets.set(ws, t, i.limit, cycleStart(today, w.cycle_start_day));
      }
      const same = i.id ? (await repos.budgets.list(ws)).find(b => b.id === i.id && temporary(b)) : undefined;
      if (i.id && !same) throw new DomainError('NOT_FOUND', 'Budget not found');
      const startsOn = same?.starts_on ?? i.startsOn ?? '', days = i.days ?? 0;
      // A real calendar day survives a round trip (Feb 31 comes back as Mar 3; month 13 throws).
      const real = (d: string) => { try { return addDays(d, 0) === d; } catch { return false; } };
      if (!real(startsOn) || !Number.isInteger(days) || days < 2 || days > 90) throw new DomainError('VALIDATION', 'A temporary budget lasts 2 to 90 days from its start day');
      const endsOn = addDays(startsOn, days);
      if (!same && startsOn < today) throw new DomainError('BUDGET_START_PAST', 'A temporary budget starts today or later');
      const clash = await repos.budgets.overlapping(ws, t, startsOn, endsOn, same?.id);
      if (clash) {
        const name = category?.name ?? c.envelopes.find(e => e.id === t.envelopeId)?.name ?? 'pocket';
        throw new DomainError('BUDGET_OVERLAP', `You already have a temporary ${name} budget from ${short(clash.starts_on)} to ${short(addDays(clash.ends_on, -1))}.`);
      }
      return repos.budgets.setTemporary(ws, t, i.limit, startsOn, endsOn, same?.id);
    },

    /**
     * Each cycle budget in the cycle holding `day`, then (for the running cycle) the live and upcoming temporary
     * ones. The forecast only for what is running today (`projected` null otherwise).
     */
    async status(day = jakartaToday(now())) {
      const w = await repos.workspaces.get(ws);
      const from = cycleStart(day, w.cycle_start_day);
      const to = nextCycleStart(from, w.cycle_start_day);
      const today = jakartaToday(now());
      const running = today >= from && today < to;
      const budgets = await repos.budgets.list(ws);
      // Upcoming ones count no days yet; ended ones live in the history.
      const shown = budgets.filter(b => (temporary(b) ? running && today < b.ends_on : true));
      const rows = await Promise.all(shown.map(async b => {
        const [start, end] = temporary(b) ? [b.starts_on, b.ends_on] : [from, to];
        const live = today >= start && today < end;
        const left = live ? (temporary(b) ? daysBetween(today, end) : daysLeft(today, w.cycle_start_day)) : 0;
        const cycleDays = daysBetween(start, end);
        const daysGone = live ? daysBetween(start, today) + 1 : null;
        const limit = b.limits.filter(l => l.effective_from <= start).sort((x, y) => y.effective_from.localeCompare(x.effective_from))[0]?.amount
          ?? b.limits[0]?.amount ?? 0;
        const spent = await spentIn(b, start, end);
        const remaining = limit - spent;
        return {
          id: b.id, categoryId: b.category_id, envelopeId: b.envelope_id, currency: b.currency_code, startsOn: b.starts_on, endsOn: b.ends_on,
          limit, spent, remaining, percent: limit ? Math.round((spent / limit) * 100) : 0,
          safePerDay: left > 0 ? Math.max(0, Math.floor(remaining / left)) : null,
          daysGone, cycleDays, ...forecast(spent, limit, cycleDays, daysGone),
        };
      }));
      return { cycle: { from, to, daysLeft: running ? daysLeft(today, w.cycle_start_day) : 0 }, budgets: rows };
    },

    /** Temporary budgets that ran to their end, newest first; nothing is archived, the dates alone decide. */
    async history() {
      const today = jakartaToday(now());
      const ended = (await repos.budgets.list(ws)).filter(temporary).filter(b => b.ends_on <= today)
        .sort((x, y) => y.ends_on.localeCompare(x.ends_on));
      return Promise.all(ended.map(async b => {
        const limit = b.limits[0]?.amount ?? 0;
        const spent = await spentIn(b, b.starts_on, b.ends_on);
        return { id: b.id, categoryId: b.category_id, envelopeId: b.envelope_id, currency: b.currency_code, startsOn: b.starts_on, endsOn: b.ends_on, limit, spent, saved: limit - spent };
      }));
    },

    async remove(id: string) {
      if (!(await repos.budgets.remove(ws, id))) throw new DomainError('NOT_FOUND', 'Budget not found');
    },
  };
}
