// The outbox: entry changes kept on the phone until the server has them. Every new, edited or deleted entry goes
// through it, with or without signal, so there is one way to save and a lost connection is just "still waiting".
// - One action per entry: a change to an entry that is still waiting is folded into it (see `fold`).
// - Sent one at a time, oldest first. No answer = it stays, with the same ticket and (for a new entry) the same
//   id, so a repeat is saved once. A refusal marks that one "not sent" and the rest go on.
// - Kept in localStorage on every change, so closing the app loses nothing.
// No React and no screens here; what waiting entries look like is models/waiting.ts.
import { signal } from '@preact/signals-react';
import type { Command } from '../../../src/lib/schemas';
import { OfflineError } from '../lib/api';
import { locked } from '../lib/lockState';
import { load, save } from '../lib/storage';
import { call, client } from './api';
import type { EntryItem, PaybackMode } from './entry';

/** An entry as a screen holds it (a goal's log sends no `people`). */
export type SavedEntry = Omit<EntryItem, 'people'> & { people?: EntryItem['people'] };
import { queryClient } from './query';

/** What quick add learns from an entry: the word typed and the merchant it was read as. */
export type Learn = { rawMerchant?: string; suggestedMerchant?: string };
export type OutboxState = 'waiting' | 'sending' | 'sent' | 'refused' | 'clash';
export type OutboxItem = {
  /** The ticket this save carries. A new one whenever the item's content changes. */
  key: string;
  /** The entry it is about. For a new entry the phone makes it. */
  entryId: string;
  op: 'create' | 'edit' | 'remove';
  command?: Command;
  learn?: Learn;
  /** A bill with Paid backs tied: the owner's answer, asked before queuing. */
  paybacks?: PaybackMode;
  /** The version an edit was made against (none for an entry this phone made a moment ago). */
  base?: number;
  /** The entry as the server last sent it, for an edit or delete of a saved entry. */
  saved?: SavedEntry;
  /** When it was logged (ms). */
  at: number;
  state: OutboxState;
  /** Tried and not delivered: its border shows at once instead of after a second. */
  held?: boolean;
  /** When the server took it (ms): data fetched after this already counts it. */
  sentAt?: number;
  /** Why the server refused it, in its own words. */
  reason?: string;
  code?: string;
  /** A clash: the entry as it is on the server now. */
  theirs?: EntryItem;
};

type Coded = Error & { code?: string; status?: number };
/**
 * What a failed send means. Only a 4xx answer with the server's own `code` is a refusal; a 5xx (the server
 * failing, or a tunnel/proxy saying the server is down) is "try later" whatever it carries.
 */
export function verdict(item: OutboxItem, e: unknown) {
  const { status = 0 } = (e ?? {}) as Coded;
  // Only the server's own codes are words; a browser error's `code` is a number (Safari's DOMException: 12).
  const code = typeof (e as Coded | null)?.code === 'string' ? (e as Coded).code : undefined;
  // Signed out (an expired tunnel or Access sign-in) is also "later": the next try may be signed in again.
  if (
    e instanceof OfflineError ||
    !code ||
    code === 'INTERNAL' ||
    code === 'UNAUTHORIZED' ||
    status >= 500
  )
    return 'later' as const;
  if (code === 'LOCKED') return 'locked' as const;
  if (code === 'ENTRY_CHANGED') return 'clash' as const;
  // Already gone is what a delete wanted.
  if (item.op === 'remove' && code === 'NOT_FOUND') return 'done' as const;
  return 'refused' as const;
}

export type OutboxDeps = {
  /** Sends one item; resolves with the entry's new version after an edit. Throws like `call`. */
  send: (item: OutboxItem) => Promise<{ version?: number }>;
  /** The entry as the server has it now (for a clash). */
  fetchEntry: (id: string) => Promise<EntryItem>;
  /** Refetches what the screens show; sent items are dropped once it is done. */
  refresh: () => Promise<unknown>;
  read: () => OutboxItem[];
  write: (items: OutboxItem[]) => void;
  online: () => boolean;
  uuid: () => string;
  now: () => number;
  /** Runs `fn` after `ms` (the retry timer). */
  later: (fn: () => void, ms: number) => void;
  onChange: (items: OutboxItem[]) => void;
  /** Entries that reached the server after showing as waiting (their row plays "saved"). */
  synced?: (entryIds: string[]) => void;
};

// ponytail: a flat 5s while something waits (no backoff): one small request, only with the app open and the
// phone online. Back off here if a long outage ever drains a battery.
const RETRY_MS = 5_000;
const open = (i: OutboxItem) =>
  i.state === 'waiting' || i.state === 'refused' || i.state === 'clash';

export function createOutbox(d: OutboxDeps) {
  // What was mid-send when the app closed is simply waiting again; what was sent is on the server.
  let items: OutboxItem[] = d
    .read()
    .filter(i => i.state !== 'sent')
    .map(i => (i.state === 'sending' ? { ...i, state: 'waiting', held: true } : i));
  let running: Promise<void> | null = null;
  let again = false;
  let timer = false;
  /** A send found no way through since the last one that did: the next success means the connection is back. */
  let down = false;

  const set = (next: OutboxItem[]) => {
    items = next;
    d.write(items);
    d.onChange(items);
  };
  const patch = (key: string, change: Partial<OutboxItem>) =>
    set(items.map(i => (i.key === key ? { ...i, ...change } : i)));
  const fresh = (): Pick<OutboxItem, 'key' | 'state' | 'reason' | 'code' | 'theirs'> => ({
    key: d.uuid(),
    state: 'waiting',
    reason: undefined,
    code: undefined,
    theirs: undefined,
  });
  /** The latest item about this entry that can still be changed (not on its way, not sent). */
  const last = (entryId: string) => items.findLast(i => i.entryId === entryId && open(i));
  const touched = (entryId: string) => items.some(i => i.entryId === entryId);

  /** Folds a change into the entry's waiting item, or queues it behind what is already on its way. */
  function fold(
    entryId: string,
    change:
      | { op: 'edit'; command: Command; paybacks?: PaybackMode }
      | { op: 'remove'; paybacks?: PaybackMode },
    saved?: SavedEntry,
  ) {
    const prev = last(entryId);
    if (prev && change.op === 'edit')
      // A new entry stays new with the latest values; an edit keeps the version it started from.
      return patch(prev.key, { ...fresh(), command: change.command, paybacks: change.paybacks });
    if (prev && prev.op === 'create') return set(items.filter(i => i.key !== prev.key));
    if (prev)
      return patch(prev.key, {
        ...fresh(),
        op: 'remove',
        command: undefined,
        paybacks: change.paybacks,
      });
    // Nothing to fold into. With something for this entry already on its way, the screen's copy is not the
    // server's yet, so there is no version to name (the one on its way hands its version over when it lands).
    const base = change.op === 'edit' && !touched(entryId) ? saved?.version : undefined;
    set([...items, { ...fresh(), entryId, ...change, base, saved, at: d.now() }]);
  }

  async function run() {
    let sent = false;
    for (;;) {
      const item = items.find(i => i.state === 'waiting');
      if (!item) break;
      if (!d.online()) {
        set(items.map(i => (i.state === 'waiting' ? { ...i, held: true } : i)));
        retry();
        break;
      }
      patch(item.key, { state: 'sending' });
      let outcome: ReturnType<typeof verdict> | 'done';
      let version: number | undefined;
      let failure: Coded | undefined;
      try {
        ({ version } = await d.send(item));
        outcome = 'done';
      } catch (e) {
        outcome = verdict(item, e);
        failure = e as Coded;
      }
      if (outcome === 'done') {
        sent = true;
        if (item.held) d.synced?.([item.entryId]);
        // The way through is back: what was refused meanwhile may have been refused by a hiccup. One more go.
        if (down) {
          down = false;
          requeue();
        }
        // The next change to this entry was made on top of this one: it starts from the version this made.
        const next = items.find(
          i => i.entryId === item.entryId && i.key !== item.key && i.op === 'edit' && open(i),
        );
        set(
          items.map(i =>
            i.key === item.key
              ? { ...i, state: 'sent' as const, sentAt: d.now() }
              : i === next
                ? { ...i, base: item.op === 'edit' ? version : undefined }
                : i,
          ),
        );
      } else if (outcome === 'later' || outcome === 'locked') {
        patch(item.key, { state: 'waiting', held: true });
        if (outcome === 'later') down = true;
        // Locked: nothing moves until the owner unlocks (the app calls flush then).
        if (outcome === 'later') retry();
        break;
      } else if (outcome === 'clash') {
        const theirs = await d.fetchEntry(item.entryId).catch(() => undefined);
        patch(item.key, { state: 'clash', code: failure?.code, reason: failure?.message, theirs });
      } else {
        patch(item.key, { state: 'refused', code: failure?.code, reason: failure?.message });
      }
    }
    if (sent) {
      // The server's rows take over from the phone's: drop ours only once the screens hold the new data.
      await d.refresh().catch(() => {});
      set(items.filter(i => i.state !== 'sent'));
    }
  }

  /** Puts refused changes back in line (a clash waits for the owner's choice). */
  function requeue() {
    if (items.some(i => i.state === 'refused'))
      set(items.map(i => (i.state === 'refused' ? { ...i, ...fresh(), held: true } : i)));
  }

  function retry() {
    if (timer) return;
    timer = true;
    d.later(() => {
      timer = false;
      void flush();
    }, RETRY_MS);
  }

  /**
   * Sends what is waiting. Safe to call any time: one run at a time, and a call during a run makes it go round
   * once more (something may have been added). The promise settles when nothing more is being tried.
   */
  function flush(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run();
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  d.onChange(items);
  return {
    items: () => items,
    flush,
    /** The connection may be back (signal returned, app reopened, unlocked): refused changes get one more go. */
    wake() {
      requeue();
      return flush();
    },
    /** Settles once the run in progress (if any) is over. */
    idle: () => running ?? Promise.resolve(),

    /** Queues a new entry; returns the id it will have. */
    create(command: Command, learn?: Learn): string {
      const entryId = d.uuid();
      set([...items, { ...fresh(), entryId, op: 'create', command, learn, at: d.now() }]);
      void flush();
      return entryId;
    },

    /** Queues an edit. `entry` is the entry as the screen shows it (the server's, or a waiting one). */
    edit(entry: SavedEntry, command: Command, paybacks?: PaybackMode) {
      fold(entry.id, { op: 'edit', command, paybacks }, entry);
      void flush();
    },

    remove(entry: SavedEntry, paybacks?: PaybackMode) {
      fold(entry.id, { op: 'remove', paybacks }, entry);
      void flush();
    },

    /** Gives up on an entry's unsent change: a new entry is gone, an edit or delete is undone. */
    discard(entryId: string) {
      set(items.filter(i => !(i.entryId === entryId && open(i))));
    },

    /** Tries a refused change again as it is. */
    resend(entryId: string) {
      const item = last(entryId);
      if (item) patch(item.key, fresh());
      void flush();
    },

    /** A clash answered "keep mine": the same edit, now on top of the server's copy. */
    keepMine(entryId: string) {
      const item = last(entryId);
      if (item?.state === 'clash')
        patch(item.key, {
          ...fresh(),
          base: item.theirs?.version,
          saved: item.theirs ?? item.saved,
        });
      void flush();
    },

    /** Forgets everything (a reset or deleted workspace). */
    clear() {
      set([]);
    },
  };
}
export type Outbox = ReturnType<typeof createOutbox>;

// ---- The app's own outbox ----

/** What is waiting, for the screens (a signal: readers re-render when it changes). */
export const outboxItems = signal<OutboxItem[]>([]);

/** A random UUID. `crypto.randomUUID` exists only on https and localhost; a phone on the Mac's LAN address has neither. */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const headers = (i: OutboxItem) => ({ headers: { 'Idempotency-Key': i.key } });
async function send(i: OutboxItem): Promise<{ version?: number }> {
  const param = { id: i.entryId };
  if (i.op === 'create') {
    await call(
      client.api.quickadd.save.$post(
        { json: { items: [{ id: i.entryId, command: i.command!, ...i.learn }] } },
        headers(i),
      ),
    );
    return {};
  }
  if (i.op === 'edit') {
    const res = await call(
      client.api.entries[':id'].$patch(
        { param, json: i.command!, query: { paybacks: i.paybacks, base: i.base } },
        headers(i),
      ),
    );
    return { version: res.version };
  }
  await call(
    client.api.entries[':id'].$delete({ param, query: { paybacks: i.paybacks } }, headers(i)),
  );
  return {};
}

export const outbox = createOutbox({
  send,
  fetchEntry: id => call(client.api.entries[':id'].$get({ param: { id } })),
  refresh: () => queryClient.invalidateQueries(),
  read: () => load<OutboxItem[]>('outbox', []),
  write: items => save('outbox', items),
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  uuid,
  now: () => Date.now(),
  later: (fn, ms) => void setTimeout(fn, ms),
  onChange: items => (outboxItems.value = items),
  synced: flashSynced,
});

/** Entries that just reached the server after waiting, for about a second (their row's "saved" moment). */
export const syncedIds = signal<ReadonlySet<string>>(new Set());
const SYNCED_MS = 2_600; // the blink-out + check in styles.css fit inside this
function flashSynced(ids: string[]) {
  syncedIds.value = new Set([...syncedIds.value, ...ids]);
  setTimeout(() => {
    const next = new Set(syncedIds.value);
    for (const id of ids) next.delete(id);
    syncedIds.value = next;
  }, SYNCED_MS);
}

/** Sends what waits whenever it may get through: at start, when the signal returns, on coming back, on unlock. */
export function watchOutbox() {
  const go = () => void (locked.value || outbox.wake());
  addEventListener('online', go);
  document.addEventListener('visibilitychange', () => document.hidden || go());
  locked.subscribe(go);
}
