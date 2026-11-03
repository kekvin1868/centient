// App-wide state. Screens read these signals. The basics (me, catalog, qctx) are mirrored from the query cache by
// models/workspace (seedBasics on start, then whenever their queries refresh).
import type { QAContext } from '@centient/quickadd';
import { effect, signal } from '@preact/signals-react';
import type { Catalog, Me } from '../models/workspace';
import { load, save } from './storage';

export type { Catalog } from '../models/workspace';

export const me = signal<Me | null>(null);
export const catalog = signal<Catalog>({ accounts: [], envelopes: [], categories: [] });
export const qctx = signal<QAContext | null>(null);
/** Home's account filter (null = all accounts), remembered on this device. */
export const selectedAccount = signal<string | null>(load('account', null));
effect(() => save('account', selectedAccount.value));
export const offline = signal(false);
/** Entries deleted but still undoable: hidden from every list until the undo window ends. */
export const hiddenEntries = signal<ReadonlySet<string>>(new Set());

export const active = <T extends { archived_at: string | null }>(rows: T[]) =>
  rows.filter(r => !r.archived_at);
/** Accounts you pay from or into: everything except "Friends owe you". */
export const everyday = () => active(catalog.value.accounts).filter(a => a.kind !== 'IOU');
export const nameOf = (rows: { id: string; name: string }[], id: string | null | undefined) =>
  rows.find(r => r.id === id)?.name ?? '';
