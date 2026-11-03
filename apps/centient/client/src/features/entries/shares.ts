// Who pays what in a split bill. Everyone starts equal; typing over a person's amount fixes it, and the people
// not fixed (me included) share what is left equally, I take the rounding. Pure, so the form and tests share it.

/** One other person on the bill. `share` null = not typed over (it follows the equal split). */
export type Party = {
  name: string;
  share: number | null;
  /** The tab this person was loaded from (editing), and the name it had then. */
  tab: string | null;
  tabName: string;
};

export const blankParty = (): Party => ({ name: '', share: null, tab: null, tabName: '' });

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
