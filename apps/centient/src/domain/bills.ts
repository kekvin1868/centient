// Split bills and the Paid backs tied to them: who owes what on a bill, and what a changed or deleted bill does to
// the Paid backs that pay it. Pure: lines and links in, numbers out.

/** A Paid back's link to a bill: how much of it pays that bill. `date` (YYYY-MM-DD) orders them, oldest first. */
export type Link = { payback: string; bill: string; tab: string; amount: number; date: string };

/** One person (tab) on a bill. `paid` = handed over at the bill + every live Paid back linked to it. */
export type Person = {
  tabId: string;
  share: number;
  paid: number;
  paybacks: { entryId: string; amount: number; date: string }[];
};

type Lines = { entries: { account_id?: string; accountId?: string; amount: number }[] }[];

/**
 * Per tab: `share` = what the bill moves into the tab, `paidAtBill` = what the same entry moves out of it ("pays the
 * rest later"). Works on saved transactions (`account_id`) and freshly built ones (`accountId`).
 */
export function tabsOnBill(txs: Lines, isTab: (accountId: string) => boolean) {
  const out = new Map<string, { share: number; paidAtBill: number }>();
  for (const t of txs)
    for (const l of t.entries) {
      const id = l.account_id ?? l.accountId ?? '';
      if (!isTab(id)) continue;
      const p = out.get(id) ?? { share: 0, paidAtBill: 0 };
      if (l.amount > 0) p.share += l.amount;
      else p.paidAtBill -= l.amount;
      out.set(id, p);
    }
  return out;
}

/** Everyone on a bill with what they paid, in the order the bill names them. */
export function peopleOf(
  billId: string,
  txs: Lines,
  isTab: (accountId: string) => boolean,
  links: Link[],
): Person[] {
  return [...tabsOnBill(txs, isTab)].map(([tabId, t]) => {
    const own = links
      .filter(l => l.bill === billId && l.tab === tabId)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      tabId,
      share: t.share,
      paid: t.paidAtBill + own.reduce((s, l) => s + l.amount, 0),
      paybacks: own.map(l => ({ entryId: l.payback, amount: l.amount, date: l.date })),
    };
  });
}

/**
 * How much of each link no longer fits once a bill's shares change (`after` = the new shares per tab; empty when the
 * bill is deleted). The oldest Paid backs keep their place; the newest give up the extra first.
 */
export function cutsFor<L extends Link>(
  links: L[],
  after: Map<string, { share: number; paidAtBill: number }>,
): { link: L; cut: number }[] {
  const out: { link: L; cut: number }[] = [];
  const byTab = new Map<string, L[]>();
  for (const l of links) byTab.set(l.tab, [...(byTab.get(l.tab) ?? []), l]);
  for (const [tab, own] of byTab) {
    const t = after.get(tab);
    let room = t ? Math.max(0, t.share - t.paidAtBill) : 0;
    for (const link of own.sort((a, b) => a.date.localeCompare(b.date))) {
      const keep = Math.min(link.amount, room);
      room -= keep;
      if (link.amount > keep) out.push({ link, cut: link.amount - keep });
    }
  }
  return out;
}
