// What CONFIRM sends, as plain steps. Each step has a stable id, so a save that fails halfway can be retried and
// skips what already went through. New accounts and pockets are referred to by draft key until they exist.
import { accountBalance, kept, owes, type Draft } from './draft';

export type Step =
  | { id: string; op: 'deleteAccount'; accountId: string }
  | { id: string; op: 'patchAccount'; accountId: string; json: { name?: string; kind?: string } }
  | { id: string; op: 'createAccount'; accountKey: string; name: string; kind: string }
  | { id: string; op: 'patchPocket'; pocketId: string; name: string }
  | { id: string; op: 'createPocket'; accountKey: string; pocketKey: string; name: string; kind: string }
  /** The account's total becomes its opening balance, which lands in Main. */
  | { id: string; op: 'setBalance'; accountKey: string; actual: number }
  /** Then each other pocket's share moves out of Main, all in one request. */
  | { id: string; op: 'allocate'; moves: { accountKey: string; pocketKey: string; amount: number }[] }
  | { id: string; op: 'finish' };

/** Order matters: deletes free names before renames and new accounts reuse them. */
export function toSteps(draft: Draft): Step[] {
  const steps: Step[] = [];
  for (const a of draft) if (a.id && !a.kept) steps.push({ id: `del:${a.key}`, op: 'deleteAccount', accountId: a.id });
  for (const a of kept(draft)) {
    if (!a.id) continue;
    const json: { name?: string; kind?: string } = {};
    if (a.name !== a.seedName) json.name = a.name;
    json.kind = a.kind; // cheap to resend, and the seed's kind isn't kept in the draft
    steps.push({ id: `acc:${a.key}`, op: 'patchAccount', accountId: a.id, json });
  }
  for (const a of kept(draft)) if (!a.id) steps.push({ id: `new:${a.key}`, op: 'createAccount', accountKey: a.key, name: a.name, kind: a.kind });
  for (const a of kept(draft)) {
    for (const p of a.pockets) {
      if (p.main) continue;
      if (p.id) steps.push({ id: `pk:${p.key}`, op: 'patchPocket', pocketId: p.id, name: p.name });
      else steps.push({ id: `npk:${p.key}`, op: 'createPocket', accountKey: a.key, pocketKey: p.key, name: p.name, kind: p.kind });
    }
  }
  const moves: { accountKey: string; pocketKey: string; amount: number }[] = [];
  for (const a of kept(draft)) {
    const total = accountBalance(a);
    if (!total) continue;
    // A card's or pay later's amount is what's owed: a negative balance, kept whole in Main.
    if (owes(a.kind)) { steps.push({ id: `bal:${a.key}`, op: 'setBalance', accountKey: a.key, actual: -total }); continue; }
    steps.push({ id: `bal:${a.key}`, op: 'setBalance', accountKey: a.key, actual: total });
    for (const p of a.pockets) if (!p.main && p.balance) moves.push({ accountKey: a.key, pocketKey: p.key, amount: p.balance });
  }
  if (moves.length) steps.push({ id: 'allocate', op: 'allocate', moves });
  steps.push({ id: 'finish', op: 'finish' });
  return steps;
}
