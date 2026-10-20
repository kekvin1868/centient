// App-wide state. Screens read these signals; any write calls refresh() so every screen reloads its data.
import type { QAContext } from '@centient/quickadd';
import { effect, signal } from '@preact/signals';
import type { Account, Category, Envelope } from '../../src/application/ports';
import { call, client } from './api';
import { load, save } from './lib/storage';

export type Me = { workspace: { id: string; name: string; cycle_start_day: number }; today: string; cycle: { from: string; to: string }; currencies: Record<string, number> };
export type Catalog = { accounts: Account[]; envelopes: Envelope[]; categories: Category[] };

export const me = signal<Me | null>(null);
export const catalog = signal<Catalog>({ accounts: [], envelopes: [], categories: [] });
export const qctx = signal<QAContext | null>(null);
/** Bumped after every write; screens reload when it changes. */
export const version = signal(0);
/** Home's account filter (null = all accounts), remembered on this device. */
export const selectedAccount = signal<string | null>(load('account', null));
effect(() => save('account', selectedAccount.value));
export const offline = signal(false);
/** Entries deleted but still undoable: hidden from every list until the undo window ends. */
export const hiddenEntries = signal<ReadonlySet<string>>(new Set());

export async function loadBasics() {
  const [m, c, q] = await Promise.all([
    call(client.api.me.$get()), call(client.api.catalog.$get()), call(client.api.quickadd.context.$get()),
  ]);
  me.value = m as Me;
  catalog.value = c as Catalog;
  qctx.value = q as QAContext;
  if (selectedAccount.value && !catalog.value.accounts.some(a => a.id === selectedAccount.value && !a.archived_at)) selectedAccount.value = null;
}

export async function refresh() {
  version.value++;
  await loadBasics();
}

export const active = <T extends { archived_at: string | null }>(rows: T[]) => rows.filter(r => !r.archived_at);
/** Accounts you pay from or into: everything except "Friends owe you". */
export const everyday = () => active(catalog.value.accounts).filter(a => a.kind !== 'IOU');
export const nameOf = (rows: { id: string; name: string }[], id: string | null | undefined) => rows.find(r => r.id === id)?.name ?? '';
