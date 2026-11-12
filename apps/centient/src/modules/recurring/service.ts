// Recurring bill use cases: subscriptions and other bills that leave on a date, what they add up to, a credit
// card's statement, and monthly payments found in past entries.
import type { ServiceDeps } from '../../context';
import { addDays, addMonths, jakartaToday, realDay } from '../../domain/cycle';
import { daysBetween } from '../../domain/forecast';
import { DomainError } from '../../domain/ledger';
import { costOf, dueDates, looksMonthly, statementOf } from '../../domain/recurring';
import type { Recurring } from '../../repos/recurring';
import type { LedgerService } from '../ledger/service';
import { advance, scheduleOf } from './advance';

type Input = {
  name: string;
  accountId: string;
  envelopeId?: string | null;
  categoryId: string;
  amount?: number | null;
  everyMonths: number;
  nextDue: string;
  endsOn?: string | null;
  service?: string | null;
};

// "Found in your entries" looks this far back: room for three or four monthly payments.
const LOOK_BACK_DAYS = 100;
const CARD_KINDS = ['CREDIT_CARD', 'PAYLATER'];

export function createRecurringService({
  ws,
  now,
  repos,
  catalog,
  ledger,
}: ServiceDeps & { ledger: LedgerService }) {
  const today = () => jakartaToday(now());

  async function find(id: string): Promise<Recurring> {
    const row = (await repos.recurring.list(ws)).find(r => r.id === id);
    if (!row) throw new DomainError('NOT_FOUND', 'Bill not found');
    return row;
  }

  /** Checks what a bill points at and its dates; returns the columns to write for the fields given. */
  async function columns(i: Partial<Input>, current?: Recurring): Promise<Partial<Recurring>> {
    const c = await catalog.load();
    const accountId = i.accountId ?? current?.account_id;
    if (i.accountId && c.account(i.accountId).row.kind === 'IOU')
      throw new DomainError('RECURRING_ACCOUNT', "A bill can't be paid from a person's tab");
    if (i.envelopeId && c.envelope(i.envelopeId).accountId !== accountId)
      throw new DomainError('POCKET_ACCOUNT', 'That pocket is in another account');
    if (i.categoryId) c.category(i.categoryId, 'EXPENSE');
    const nextDue = i.nextDue ?? current?.next_due;
    for (const d of [i.nextDue, i.endsOn])
      if (d && !realDay(d)) throw new DomainError('VALIDATION', `${d} is not a real date`);
    if (i.endsOn && nextDue && i.endsOn < nextDue)
      throw new DomainError('RECURRING_ENDS', 'It ends before its next due date');
    const out: Partial<Recurring> = {};
    if (i.name !== undefined) out.name = i.name.trim();
    if (i.accountId !== undefined) out.account_id = i.accountId;
    // A bill moved to another account can't keep a pocket of the old one.
    if (i.envelopeId !== undefined || i.accountId !== undefined)
      out.envelope_id = i.envelopeId ?? null;
    if (i.categoryId !== undefined) out.category_id = i.categoryId;
    if (i.amount !== undefined) out.amount = i.amount;
    if (i.everyMonths !== undefined) out.every_months = i.everyMonths;
    if (i.nextDue !== undefined) {
      out.next_due = i.nextDue;
      out.due_day = Number(i.nextDue.slice(8));
    }
    if (i.endsOn !== undefined) out.ends_on = i.endsOn;
    if (i.service !== undefined) out.service = i.service?.trim().toLowerCase() || null;
    return out;
  }

  return {
    /**
     * Everything the Subscriptions screen and Home's "Coming up" show: each bill with its due dates for the
     * next 12 months, what the bills cost per currency, and each card's statement.
     */
    async list() {
      const day = today();
      const until = addMonths(day, 12);
      const [rows, c] = await Promise.all([repos.recurring.list(ws), catalog.load()]);
      const currencyOf = (accountId: string) =>
        c.accounts.find(a => a.id === accountId)?.currency_code;

      const totals = new Map<string, { perMonth: number; perYear: number }>();
      for (const r of rows) {
        const currency = currencyOf(r.account_id);
        if (!currency || r.amount === null || r.paused_at) continue;
        const cost = costOf(r.amount, r.every_months);
        const sum = totals.get(currency) ?? { perMonth: 0, perYear: 0 };
        totals.set(currency, {
          perMonth: sum.perMonth + cost.perMonth,
          perYear: sum.perYear + cost.perYear,
        });
      }

      const cards = await Promise.all(
        c.accounts
          .filter(a => CARD_KINDS.includes(a.kind) && a.statement_day && !a.archived_at)
          .map(async a => {
            const { cutOff, dueOn } = statementOf(a.statement_day!, a.due_day, day);
            const s = await repos.recurring.statement(ws, a.id, cutOff);
            const bill = Math.max(0, -s.balance);
            return {
              accountId: a.id,
              cutOff,
              dueOn,
              bill,
              left: Math.max(0, bill - s.paid),
              spentSince: s.spent,
            };
          }),
      );

      return {
        today: day,
        items: rows.map(r => ({
          id: r.id,
          name: r.name,
          accountId: r.account_id,
          envelopeId: r.envelope_id,
          categoryId: r.category_id,
          currency: currencyOf(r.account_id) ?? 'IDR',
          amount: r.amount,
          everyMonths: r.every_months,
          nextDue: r.next_due,
          endsOn: r.ends_on,
          service: r.service,
          paused: r.paused_at !== null,
          dues: r.paused_at ? [] : dueDates(scheduleOf(r), until),
        })),
        totals: [...totals].map(([currency, t]) => ({ currency, ...t })),
        cards,
      };
    },

    async create(i: Input) {
      const cols = await columns(i);
      return repos.recurring.create(ws, {
        name: i.name.trim(),
        account_id: i.accountId,
        envelope_id: i.envelopeId ?? null,
        category_id: i.categoryId,
        amount: i.amount ?? null,
        every_months: i.everyMonths,
        next_due: i.nextDue,
        due_day: cols.due_day!,
        ends_on: i.endsOn ?? null,
        service: cols.service ?? null,
      });
    },

    async update(id: string, i: Partial<Input> & { paused?: boolean }) {
      const { paused, ...fields } = i;
      const patch = await columns(fields, await find(id));
      if (paused !== undefined) patch.paused_at = paused ? new Date(now()).toISOString() : null;
      await repos.recurring.update(ws, id, patch);
    },

    async remove(id: string) {
      await find(id);
      await repos.recurring.update(ws, id, { archived_at: new Date(now()).toISOString() });
    },

    /**
     * Mark paid: logs the expense (the bill's name as merchant) and moves the bill on, in one write. A bill
     * whose amount varies needs `amount`.
     */
    async paid(id: string, i: { date?: string; amount?: number }) {
      const row = await find(id);
      const amount = i.amount ?? row.amount;
      if (!amount) throw new DomainError('AMOUNT_NEEDED', 'Enter what you paid');
      const entries = await ledger.prepare([
        {
          type: 'EXPENSE',
          accountId: row.account_id,
          envelopeId: row.envelope_id ?? undefined,
          categoryId: row.category_id,
          amount,
          date: i.date ?? today(),
          merchant: row.name,
        },
      ]);
      const { ids, stmts } = repos.entries.insertStatements(ws, entries);
      await repos.batch([...stmts, advance(repos, ws, row, new Date(now()).toISOString())]);
      return ids[0];
    },

    /**
     * "Found in your entries": merchants paid about monthly on one account, the latest payment recent enough to
     * still be running, not already a bill and not hidden. Rules only.
     */
    async found() {
      const day = today();
      const [payments, rows, hidden] = await Promise.all([
        repos.recurring.payments(ws, addDays(day, -LOOK_BACK_DAYS)),
        repos.recurring.list(ws),
        repos.recurring.hidden(ws),
      ]);
      const known = new Set([
        ...hidden,
        ...rows.flatMap(r => [r.name.toLowerCase(), r.service ?? '']),
      ]);
      const groups = new Map<string, typeof payments>();
      for (const p of payments) {
        if (known.has(p.merchant)) continue;
        const key = `${p.merchant}|${p.account_id}`;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      return [...groups.values()]
        .filter(g => looksMonthly(g) && daysBetween(g.at(-1)!.day, day) <= 36)
        .map(g => {
          const last = g.at(-1)!;
          return {
            merchant: last.merchant,
            accountId: last.account_id,
            categoryId: last.category_id,
            amount: last.amount,
            lastPaid: last.day,
            nextDue: addMonths(last.day, 1),
            payments: g.length,
          };
        })
        .sort((a, b) => a.merchant.localeCompare(b.merchant));
    },

    async hide(merchant: string) {
      await repos.recurring.hide(ws, merchant.trim().toLowerCase());
    },
  };
}
