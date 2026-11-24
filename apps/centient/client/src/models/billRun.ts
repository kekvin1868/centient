// The Bills page's view of the recurring bills: every due date as a row (paid, due or late), what this month
// still asks for, and the list's groups. Pure. Only the Bills screen reads it, so it is not in Home's download
// (see ./recurring for what Home needs).
import { addDays } from './dates';
import type { CardStatement, Recurring } from './recurring';

/** One due date of one bill. */
export type BillRow = {
  key: string;
  item: Recurring;
  due: string;
  state: 'paid' | 'due' | 'late';
  /** Paid: what the entry holds. Open: the bill's amount, else its last payment (`guess`), else null. */
  amount: number | null;
  guess: boolean;
  /**
   * Has the PAID? key: the bill's current due date, when it falls in this month (or earlier) or within a week.
   * One further off is paid from the bill's form, so a stray tap never pays next month.
   */
  payable: boolean;
  /** Paid rows only. */
  paidOn?: string;
  entryId?: string;
};

export const paidLate = (r: BillRow) => r.paidOn !== undefined && r.paidOn > r.due;

/** A bill's rows, oldest first: its saved payments, then its open due dates (the next 12 months; none while paused). */
export function rowsOf(item: Recurring, today: string): BillRow[] {
  const paid: BillRow[] = item.payments.map(p => ({
    key: `${item.id}:${p.due}`,
    item,
    due: p.due,
    state: 'paid',
    amount: p.amount,
    guess: false,
    payable: false,
    paidOn: p.paidOn,
    entryId: p.entryId,
  }));
  const amount = item.amount ?? item.payments.at(-1)?.amount ?? null;
  const open: BillRow[] = item.dues
    // A due date moved back by hand onto a paid one stays paid.
    .filter(due => !item.payments.some(p => p.due === due))
    .map(due => ({
      key: `${item.id}:${due}`,
      item,
      due,
      state: due < today ? 'late' : 'due',
      amount,
      guess: item.amount === null,
      payable: due === item.nextDue && paysNow(due, today),
    }));
  return [...paid, ...open];
}

/** The calendar's marks: day -> the rows due that day. */
export function rowsByDay(items: Recurring[], today: string): Map<string, BillRow[]> {
  const out = new Map<string, BillRow[]>();
  for (const item of items)
    for (const row of rowsOf(item, today)) out.set(row.due, [...(out.get(row.due) ?? []), row]);
  return out;
}

const monthOf = (day: string) => ({
  start: `${day.slice(0, 7)}-01`,
  // Day strings compare as text, so "-31" is past the end of any month.
  end: `${day.slice(0, 7)}-31`,
});

/** A due date paid without asking: in this month (or earlier) or within a week. Further off, Mark paid asks first. */
export const paysNow = (due: string, today: string) =>
  due <= monthOf(today).end || due <= addDays(today, 7);

/** Paid for this month: its due date is in it, or an older one was caught up on in it. */
const paidThisMonth = (r: BillRow, today: string) => {
  const { start, end } = monthOf(today);
  return r.state === 'paid' && r.due <= end && (r.due >= start || (r.paidOn ?? '') >= start);
};

export type MonthRun = {
  currency: string;
  /** Everything this month asks for, and what of it is still open (late ones from earlier months too). */
  total: number;
  left: number;
  paid: number;
  count: number;
  late: number;
  /** Paid after their due date. */
  latePaid: number;
  /** Open rows with no amount to count (a bill that varies and was never paid). */
  unknown: number;
};

/** What this month asks for, per currency. Paused bills are outside it. */
export function monthRun(items: Recurring[], today: string): MonthRun[] {
  const { end } = monthOf(today);
  const runs = new Map<string, MonthRun>();
  for (const item of items) {
    if (item.paused) continue;
    for (const r of rowsOf(item, today)) {
      const paid = paidThisMonth(r, today);
      if (!paid && (r.state === 'paid' || r.due > end)) continue;
      const run = runs.get(item.currency) ?? {
        currency: item.currency,
        total: 0,
        left: 0,
        paid: 0,
        count: 0,
        late: 0,
        latePaid: 0,
        unknown: 0,
      };
      run.count++;
      run.total += r.amount ?? 0;
      if (paid) {
        run.paid++;
        if (paidLate(r)) run.latePaid++;
      } else {
        run.left += r.amount ?? 0;
        if (r.state === 'late') run.late++;
        if (r.amount === null) run.unknown++;
      }
      runs.set(item.currency, run);
    }
  }
  return [...runs.values()];
}

/**
 * A card's one bill (its installment slices ride inside it). The Bills page shows and tags it, but it is never in
 * the month's run: a bill paid by card is already inside the card bill, so counting both would double it.
 */
export type OtherDue = {
  key: string;
  kind: 'CARD';
  due: string;
  late: boolean;
  accountId: string;
  /** What is still to pay. */
  amount: number;
};

/** Card bills with money left, soonest first. */
export function otherDues(cards: CardStatement[], today: string): OtherDue[] {
  return cards
    .flatMap<OtherDue>(c =>
      c.dueOn && c.left > 0
        ? [
            {
              key: `card:${c.accountId}`,
              kind: 'CARD',
              due: c.dueOn,
              late: c.dueOn < today,
              accountId: c.accountId,
              amount: c.left,
            },
          ]
        : [],
    )
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** The calendar's hollow marks: day -> what is due that day. */
export function othersByDay(others: OtherDue[]): Map<string, OtherDue[]> {
  const out = new Map<string, OtherDue[]>();
  for (const o of others) out.set(o.due, [...(out.get(o.due) ?? []), o]);
  return out;
}

/** How many of them fall in this month or are late: the hero's "+N outside the bar". */
export const outsideRun = (others: OtherDue[], today: string) =>
  others.filter(o => o.due <= monthOf(today).end).length;

export type BillGroup = {
  label: 'Late' | 'Next 7 days' | 'Later' | 'Paid' | 'Paused';
  rows: (BillRow | OtherDue)[];
};

/**
 * The list: every bill once (and `others`, by date). Late or due within a week by its next due date; else under Paid when this month's
 * is paid; else Later. Each group soonest first.
 */
export function billGroups(
  items: Recurring[],
  today: string,
  others: OtherDue[] = [],
): BillGroup[] {
  const soon = addDays(today, 7);
  const groups: Record<BillGroup['label'], BillGroup['rows']> = {
    Late: [],
    'Next 7 days': [],
    Later: [],
    Paid: [],
    Paused: [],
  };
  for (const item of items) {
    const rows = rowsOf(item, today);
    const next = rows.find(r => r.state !== 'paid');
    const paid = rows.findLast(r => paidThisMonth(r, today));
    if (item.paused)
      groups.Paused.push({
        key: `${item.id}:paused`,
        item,
        due: item.nextDue,
        state: 'due',
        amount: item.amount,
        guess: false,
        payable: false,
      });
    else if (next && next.due <= soon)
      groups[next.state === 'late' ? 'Late' : 'Next 7 days'].push(next);
    else if (paid) groups.Paid.push(paid);
    else if (next) groups.Later.push(next);
  }
  // Card bills sit among the bills, by date.
  for (const o of others) groups[o.late ? 'Late' : o.due <= soon ? 'Next 7 days' : 'Later'].push(o);
  return (Object.keys(groups) as BillGroup['label'][])
    .map(label => ({ label, rows: groups[label].sort((a, b) => a.due.localeCompare(b.due)) }))
    .filter(g => g.rows.length);
}
