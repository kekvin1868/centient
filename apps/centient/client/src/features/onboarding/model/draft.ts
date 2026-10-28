// The first-run setup as an editable draft: nothing reaches the server until the user confirms. Every action is a
// pure function that returns a new draft, so undo is just the previous value.
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';

export type PocketKind = 'SPENDING' | 'SAVINGS';
/** `balance` null = not set yet (shown as ???). `id` is the server's, null until saved. */
export type PocketDraft = { key: string; id: string | null; name: string; kind: PocketKind; balance: number | null; main: boolean };
/** `seedName` is the name it came with (null = added in this draft); a seeded account can be dropped and kept again. */
export type AccountDraft = { key: string; id: string | null; seedName: string | null; name: string; kind: string; kept: boolean; pockets: PocketDraft[] };
export type Draft = AccountDraft[];

export const MAX_ACCOUNTS = 20;
export const NAME_MAX = 18;
/** Kinds offered here; "Friends owe you" accounts appear on their own with the first split bill. */
export const SETUP_KINDS = ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH', 'CREDIT_CARD', 'PAYLATER', 'EXCHANGE'];

/** Card and pay later balances are amounts owed. */
export const owes = (kind: string) => kind === 'CREDIT_CARD' || kind === 'PAYLATER';

let seq = 0;
const key = (p: string) => `${p}${++seq}`;
const mainPocket = (id: string | null = null): PocketDraft => ({ key: key('p'), id, name: 'Main', kind: 'SPENDING', balance: null, main: true });

// Bank first, then e-wallet, then card: the order people think of them in.
const ORDER = ['BANK', 'EWALLET', 'DEBIT_CARD', 'CASH'];
const rank = (kind: string) => ORDER.indexOf(kind) + 1 || 9;

/** The seeded workspace as a draft: everyday accounts, each with its Main pocket first. */
export function fromCatalog(accounts: Account[], envelopes: Envelope[]): Draft {
  return accounts
    .filter(a => !a.archived_at && a.kind !== 'IOU')
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map(a => {
      const own = envelopes.filter(e => e.account_id === a.id && !e.archived_at);
      const others = own.filter(e => e.id !== a.default_envelope_id)
        .map(e => ({ key: key('p'), id: e.id, name: e.name, kind: e.kind === 'SAVINGS' ? 'SAVINGS' : 'SPENDING', balance: null, main: false }) as PocketDraft);
      return { key: key('a'), id: a.id, seedName: a.name, name: a.name, kind: a.kind, kept: true, pockets: [mainPocket(a.default_envelope_id), ...others] };
    });
}

/** An account's balance is the sum of its pockets; null until at least one is set. */
export function accountBalance(a: AccountDraft): number | null {
  const set = a.pockets.filter(p => p.balance !== null);
  return set.length ? set.reduce((t, p) => t + p.balance!, 0) : null;
}

export const kept = (d: Draft) => d.filter(a => a.kept);
const map = (d: Draft, k: string, fn: (a: AccountDraft) => AccountDraft) => d.map(a => (a.key === k ? fn(a) : a));

export const rename = (d: Draft, k: string, name: string) => {
  const v = name.trim().slice(0, NAME_MAX);
  return v ? map(d, k, a => ({ ...a, name: v })) : d;
};
export const setKind = (d: Draft, k: string, kind: string) => map(d, k, a => ({ ...a, kind }));

/** Seeded accounts drop and come back; ones added in this draft are simply removed. */
export const toggle = (d: Draft, k: string) => {
  const a = d.find(x => x.key === k);
  if (!a) return d;
  return a.seedName === null ? d.filter(x => x.key !== k) : map(d, k, x => ({ ...x, kept: !x.kept }));
};

/** Adds a cash account at the end; null when the draft is full. */
export function addAccount(d: Draft): { draft: Draft; key: string } | null {
  if (d.length >= MAX_ACCOUNTS) return null;
  const a: AccountDraft = { key: key('a'), id: null, seedName: null, name: 'New Account', kind: 'CASH', kept: true, pockets: [mainPocket()] };
  return { draft: [...d, a], key: a.key };
}

export function addPocket(d: Draft, k: string): { draft: Draft; key: string } {
  const p: PocketDraft = { key: key('p'), id: null, name: '', kind: 'SAVINGS', balance: null, main: false };
  return { draft: map(d, k, a => ({ ...a, pockets: [...a.pockets, { ...p, name: `Pocket ${a.pockets.length}` }] })), key: p.key };
}

/** Main keeps its name and has no kind of its own; only its balance changes. */
export const editPocket = (d: Draft, k: string, pk: string, patch: Partial<Pick<PocketDraft, 'name' | 'kind' | 'balance'>>) =>
  map(d, k, a => ({
    ...a,
    pockets: a.pockets.map(p => {
      if (p.key !== pk) return p;
      if (p.main) return { ...p, balance: patch.balance === undefined ? p.balance : patch.balance };
      const name = patch.name?.trim().slice(0, NAME_MAX);
      return { ...p, ...patch, name: name || p.name };
    }),
  }));

export const removePocket = (d: Draft, k: string, pk: string) =>
  map(d, k, a => ({ ...a, pockets: a.pockets.filter(p => p.main || p.key !== pk) }));
