// Who pays what in a split bill. Everyone starts equal; typing over a person's amount fixes it, and the people
// not fixed (me included) share what is left equally, I take the rounding. Pure, so the form and tests share it.

/** One other person on the bill. `share` null = not typed over (it follows the equal split). */
export type Mode = 'SPLIT' | 'COVER' | 'LATER';

export type Party = {
  name: string;
  share: number | null;
  /** When a typed amount is short of the equal share: others pay the gap (SPLIT), I cover it, or it stays on their tab. */
  mode: Mode;
  /** COVER: the account that pays the gap; LATER: the account that got what they handed over. null = the bill's account. */
  accountId: string | null;
  /** The tab this person was loaded from (editing), and the name it had then. */
  tab: string | null;
  tabName: string;
  /** A cover from another account, as saved (editing): passed back unchanged, its own entry is not edited here. */
  cover: { amount: number; accountId: string } | null;
};

export const blankParty = (): Party => ({
  name: '',
  share: null,
  mode: 'SPLIT',
  accountId: null,
  tab: null,
  tabName: '',
  cover: null,
});

export type Shares = {
  mine: number;
  others: number[];
  /** What is wrong, if anything: amounts that do not add up, add up to too much, or leave me nothing. */
  problem: null | 'gap' | 'over' | 'mine';
  /** total - the amounts, when problem is gap (all fixed) or over. */
  gap: number;
};

/** `others`: each other person's typed amount or null; `myFixed`: my own typed amount or null. */
export function shareMath(
  amount: number | null,
  others: (number | null)[],
  myFixed: number | null,
): Shares {
  const total = amount ?? 0;
  const rest = total - others.reduce<number>((s, x) => s + (x ?? 0), 0) - (myFixed ?? 0);
  const free = others.filter(x => x === null).length + (myFixed === null ? 1 : 0);
  if (free === 0) {
    const mine = myFixed ?? 0;
    return {
      mine,
      others: others as number[],
      gap: rest,
      problem: rest !== 0 ? 'gap' : mine <= 0 ? 'mine' : null,
    };
  }
  if (rest < 0) {
    return {
      mine: myFixed ?? 0,
      others: others.map(x => x ?? 0),
      gap: rest,
      problem: 'over',
    };
  }
  const each = Math.floor(rest / free);
  const extra = rest - each * free;
  // I take the rounding; if I typed my own amount, the first person left on auto takes it.
  const first = others.indexOf(null);
  const mine = myFixed ?? each + extra;
  return {
    mine,
    others: others.map((x, i) => x ?? each + (myFixed !== null && i === first ? extra : 0)),
    gap: 0,
    problem: mine <= 0 ? 'mine' : null,
  };
}

/** The same bill with `n` people in all (me included): people are added at the end or taken from the end. */
export function withPeople<T extends { split: number | null; parties: Party[] }>(
  f: T,
  n: number,
): T {
  const people = Math.min(50, Math.max(1, n));
  const parties = f.parties.slice(0, people - 1);
  while (parties.length < people - 1) parties.push(blankParty());
  return { ...f, split: people > 1 ? people : null, parties };
}

export type SplitView = Omit<Shares, 'problem'> & {
  /** What each other person is put down for (their tab gets this). */
  owes: number[];
  /** COVER: what I cover for each person; LATER: what each handed over now (0 when neither). */
  covered: number[];
  paidNow: number[];
  /** The first person whose typed amount leaves nothing to cover, or who must be named. */
  badIndex: number;
  problem: Shares['problem'] | 'nothing' | 'name';
};

/** shareMath plus the "short" modes: a covered or paying-later person counts at their equal share for everyone else. */
export function splitView(
  amount: number | null,
  parties: Party[],
  myFixed: number | null,
): SplitView {
  const active = (p: Party) => p.mode !== 'SPLIT' && p.share !== null;
  const base = shareMath(
    amount,
    parties.map(p => (active(p) ? null : p.share)),
    myFixed,
  );
  const covered = parties.map(() => 0);
  const paidNow = parties.map(() => 0);
  let badIndex = -1;
  let problem = base.problem as SplitView['problem'];
  const owes = base.others.map((full, i) => {
    const p = parties[i];
    if (!active(p)) return full;
    if (p.share! >= full) {
      if (badIndex < 0) badIndex = i;
      problem ??= 'nothing';
      return full;
    }
    if (p.mode === 'COVER') {
      covered[i] = full - p.share!;
      return p.share!;
    }
    if (!p.name.trim() && !p.tab && badIndex < 0) {
      badIndex = i;
      problem ??= 'name';
    }
    paidNow[i] = p.share!;
    return full;
  });
  const cover = covered.reduce((s, x) => s + x, 0);
  return { ...base, mine: base.mine + cover, owes, covered, paidNow, badIndex, problem };
}
