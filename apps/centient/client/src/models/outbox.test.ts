// The outbox on its own: how changes to one entry fold together, what each answer from the server does to an
// item, the order things go out in, and what survives closing the app.
import { describe, expect, it } from 'vitest';
import type { Command } from '../../../src/lib/schemas';
import { OfflineError } from '../lib/api';
import { createOutbox, type OutboxItem, type SavedEntry } from './outbox';

const kopi = (amount = 25_000): Command => ({
  type: 'EXPENSE',
  accountId: 'bca',
  categoryId: 'food',
  amount,
  date: '2026-11-13',
  merchant: 'kopi',
});
const saved = (id: string, version = 1): SavedEntry => ({
  id,
  kind: 'USER',
  occurred_at: '2026-11-13T10:00:00+07:00',
  command: kopi(),
  icon: null,
  version,
  transactions: [],
  people: null,
});
const refusal = (code: string, message = code) => Object.assign(new Error(message), { code });

function setup(o: { stored?: OutboxItem[]; online?: boolean } = {}) {
  let n = 0;
  const world = {
    online: o.online ?? true,
    stored: o.stored ?? ([] as OutboxItem[]),
    sent: [] as OutboxItem[],
    refreshed: 0,
    synced: [] as string[],
    timers: [] as (() => void)[],
    /** What the server does with the next sends, first come first served; none left = it works. */
    answers: [] as (
      ((i: OutboxItem) => { version?: number } | Promise<{ version?: number }>) | Error
    )[],
  };
  const box = createOutbox({
    send: async item => {
      world.sent.push(item);
      const a = world.answers.shift();
      if (a instanceof Error) throw a;
      return (await a?.(item)) ?? {};
    },
    fetchEntry: async id => ({ ...saved(id, 7), people: null }),
    refresh: async () => void world.refreshed++,
    read: () => world.stored,
    write: items => (world.stored = items),
    online: () => world.online,
    uuid: () => `id-${++n}`,
    now: () => 1000 + n,
    later: fn => void world.timers.push(fn),
    onChange: () => {},
    synced: ids => world.synced.push(...ids),
  });
  const state = () => box.items().map(i => `${i.op}:${i.entryId}:${i.state}`);
  return { box, world, state };
}

describe('folding changes to one entry', () => {
  // Offline, so nothing leaves and every change meets a waiting item.
  const offline = () => setup({ online: false });

  it('new + edit = one new entry with the latest values and a new ticket', async () => {
    const { box } = offline();
    const id = box.create(kopi());
    const [first] = box.items();
    box.edit(saved(id), kopi(30_000));
    expect(box.items()).toHaveLength(1);
    expect(box.items()[0]).toMatchObject({
      op: 'create',
      entryId: id,
      command: { amount: 30_000 },
    });
    expect(box.items()[0].key).not.toBe(first.key);
  });

  it('new + delete = nothing', () => {
    const { box } = offline();
    const id = box.create(kopi());
    box.remove(saved(id));
    expect(box.items()).toEqual([]);
  });

  it('edit + edit = the last edit, on the version the first started from', () => {
    const { box } = offline();
    box.edit(saved('a', 3), kopi(28_000));
    box.edit({ ...saved('a', 0) }, kopi(30_000));
    expect(box.items()).toHaveLength(1);
    expect(box.items()[0]).toMatchObject({ op: 'edit', base: 3, command: { amount: 30_000 } });
  });

  it('edit + delete = one delete', () => {
    const { box, state } = offline();
    box.edit(saved('a'), kopi(28_000));
    box.remove(saved('a'));
    expect(state()).toEqual(['remove:a:waiting']);
  });

  it('entries do not fold into each other', () => {
    const { box } = offline();
    box.create(kopi());
    box.create(kopi());
    box.edit(saved('a'), kopi(1));
    expect(box.items()).toHaveLength(3);
  });

  it('a change to an entry already on its way queues behind it', async () => {
    const { box, world } = setup();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    world.answers.push(async () => {
      await gate;
      return {};
    });
    const id = box.create(kopi());
    await Promise.resolve();
    expect(box.items()[0].state).toBe('sending');
    box.edit(saved(id, 0), kopi(30_000));
    expect(box.items().map(i => i.op)).toEqual(['create', 'edit']);
    // No version to name: the server's copy is the one this phone is still sending.
    expect(box.items()[1].base).toBeUndefined();
    release();
    await box.idle();
    expect(world.sent.map(i => i.op)).toEqual(['create', 'edit']);
    expect(box.items()).toEqual([]);
  });
});

describe('sending', () => {
  it('sends oldest first, one at a time, then refreshes once and drops what was sent', async () => {
    const { box, world } = setup({ online: false });
    const a = box.create(kopi(1));
    const b = box.create(kopi(2));
    world.online = true;
    await box.flush();
    await box.idle();
    expect(world.sent.map(i => i.entryId)).toEqual([a, b]);
    expect(world.refreshed).toBe(1);
    expect(box.items()).toEqual([]);
    expect(world.stored).toEqual([]);
  });

  it('keeps an entry with the same ticket and id when no answer comes, and retries later', async () => {
    const { box, world, state } = setup();
    world.answers.push(new OfflineError());
    const id = box.create(kopi());
    await box.idle();
    expect(state()).toEqual([`create:${id}:waiting`]);
    expect(box.items()[0].held).toBe(true);
    const ticket = box.items()[0].key;
    // Logging another one meanwhile: its own id and ticket, behind the first.
    world.answers.push(new OfflineError());
    const other = box.create(kopi(18_000));
    await box.idle();
    expect(box.items().map(i => i.entryId)).toEqual([id, other]);
    expect(world.timers.length).toBeGreaterThan(0);
    // The retry: both go, the first with the ticket and id it always had.
    world.timers.shift()!();
    await box.idle();
    const tries = world.sent.filter(i => i.entryId === id);
    expect(tries.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tries.map(i => i.key))).toEqual(new Set([ticket]));
    expect(box.items()).toEqual([]);
  });

  it('treats a server error and an answer that is not the server\'s as "try later"', async () => {
    const proxyDown = Object.assign(refusal('ERR_NGROK_8012'), { status: 502 });
    // Safari's JSON parse error is a DOMException carrying a numeric code.
    const safari = Object.assign(new Error('The string did not match the expected pattern.'), {
      code: 12,
    });
    for (const failure of [refusal('INTERNAL'), new SyntaxError('<html>'), proxyDown, safari]) {
      const { box, world, state } = setup();
      world.answers.push(failure);
      const id = box.create(kopi());
      await box.idle();
      expect(state()).toEqual([`create:${id}:waiting`]);
    }
  });

  it('does not try while the phone says it is offline', async () => {
    const { box, world } = setup({ online: false });
    box.create(kopi());
    await box.flush();
    expect(world.sent).toEqual([]);
    expect(box.items()[0]).toMatchObject({ state: 'waiting', held: true });
  });

  it('marks a refused entry with the reason and sends the rest', async () => {
    const { box, world, state } = setup({ online: false });
    const a = box.create(kopi(1));
    const b = box.create(kopi(2));
    world.online = true;
    world.answers.push(refusal('NOT_FOUND', 'Pocket not found'));
    await box.flush();
    await box.idle();
    expect(state()).toEqual([`create:${a}:refused`]);
    expect(box.items()[0]).toMatchObject({ reason: 'Pocket not found', code: 'NOT_FOUND' });
    expect(world.sent.map(i => i.entryId)).toEqual([a, b]);
    // Not tried again by itself.
    await box.flush();
    expect(world.sent).toHaveLength(2);
  });

  it('treats signed out as "try later"', async () => {
    const { box, world, state } = setup();
    world.answers.push(refusal('UNAUTHORIZED'));
    const id = box.create(kopi());
    await box.idle();
    expect(state()).toEqual([`create:${id}:waiting`]);
  });

  it('gives refused entries one more go once the connection is back', async () => {
    const { box, world, state } = setup({ online: false });
    const a = box.create(kopi(1));
    const b = box.create(kopi(2));
    world.online = true;
    // a is refused, then the server goes away under b, then comes back.
    world.answers.push(refusal('NOT_FOUND'), new OfflineError());
    await box.flush();
    await box.idle();
    expect(state()).toEqual([`create:${a}:refused`, `create:${b}:waiting`]);
    world.timers.shift()!();
    await box.idle();
    // b went through, so a was tried again (and worked).
    expect(world.sent.map(i => i.entryId)).toEqual([a, b, b, a]);
    expect(state()).toEqual([]);
    expect(world.synced).toEqual([b, a]);
  });

  it('wake() retries refused entries but leaves a clash for the owner', async () => {
    const { box, world, state } = setup({ online: false });
    const a = box.create(kopi(1));
    const c = 'entry-c';
    box.edit(saved(c), kopi(3));
    world.online = true;
    world.answers.push(refusal('VALIDATION'), refusal('ENTRY_CHANGED'));
    await box.flush();
    await box.idle();
    expect(state()).toEqual([`create:${a}:refused`, `edit:${c}:clash`]);
    await box.wake();
    expect(state()).toEqual([`edit:${c}:clash`]);
    expect(world.sent.filter(i => i.entryId === c)).toHaveLength(1);
  });

  it('plays "saved" only for entries that showed as waiting', async () => {
    const { box, world } = setup();
    box.create(kopi());
    await box.idle();
    expect(world.synced).toEqual([]);
  });

  it('stops at a locked app without a retry timer, and leaves the order alone', async () => {
    const { box, world, state } = setup({ online: false });
    const a = box.create(kopi(1));
    const b = box.create(kopi(2));
    world.online = true;
    world.timers.length = 0;
    world.answers.push(refusal('LOCKED'));
    await box.flush();
    await box.idle();
    expect(state()).toEqual([`create:${a}:waiting`, `create:${b}:waiting`]);
    expect(world.timers).toEqual([]);
  });

  it('counts a delete of an entry that is already gone as done', async () => {
    const { box, world } = setup();
    world.answers.push(refusal('NOT_FOUND'));
    box.remove(saved('a'));
    await box.flush();
    expect(box.items()).toEqual([]);
  });

  it('send again and discard', async () => {
    const { box, world, state } = setup();
    world.answers.push(refusal('WRONG_CATEGORY_KIND'));
    const id = box.create(kopi());
    await box.flush();
    const refusedKey = box.items()[0].key;
    box.resend(id);
    await box.flush();
    expect(world.sent[1].key).not.toBe(refusedKey);
    expect(box.items()).toEqual([]);

    world.answers.push(refusal('WRONG_CATEGORY_KIND'));
    const again = box.create(kopi());
    await box.flush();
    expect(state()).toEqual([`create:${again}:refused`]);
    box.discard(again);
    expect(box.items()).toEqual([]);
  });
});

describe('an edit that meets a changed entry', () => {
  it("becomes a clash holding the server's copy; keep mine sends it on that version", async () => {
    const { box, world, state } = setup();
    world.answers.push(refusal('ENTRY_CHANGED'));
    box.edit(saved('a', 1), kopi(30_000));
    await box.flush();
    expect(state()).toEqual(['edit:a:clash']);
    expect(box.items()[0].theirs?.version).toBe(7);

    box.keepMine('a');
    await box.flush();
    expect(world.sent[1]).toMatchObject({ op: 'edit', base: 7, command: { amount: 30_000 } });
    expect(box.items()).toEqual([]);
  });

  it('keep theirs drops the edit', async () => {
    const { box, world } = setup();
    world.answers.push(refusal('ENTRY_CHANGED'));
    box.edit(saved('a', 1), kopi(30_000));
    await box.flush();
    box.discard('a');
    expect(box.items()).toEqual([]);
    expect(world.sent).toHaveLength(1);
  });

  it('never clashes with itself: a sent edit hands its version to the next one', async () => {
    const { box, world } = setup();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    world.answers.push(async () => {
      await gate;
      return { version: 2 };
    });
    box.edit(saved('a', 1), kopi(28_000));
    await Promise.resolve();
    // The first is on its way; the screen still shows version 1.
    box.edit(saved('a', 1), kopi(30_000));
    release();
    await box.idle();
    expect(world.sent.map(i => i.base)).toEqual([1, 2]);
    expect(box.items()).toEqual([]);
  });
});

describe('closing the app', () => {
  it('keeps what waits; something mid-send waits again; something sent is gone', () => {
    const item = (entryId: string, state: OutboxItem['state']): OutboxItem => ({
      key: `k-${entryId}`,
      entryId,
      op: 'create',
      command: kopi(),
      at: 1,
      state,
    });
    const { state } = setup({
      stored: [item('a', 'waiting'), item('b', 'sending'), item('c', 'sent'), item('d', 'refused')],
      online: false,
    });
    expect(state()).toEqual(['create:a:waiting', 'create:b:waiting', 'create:d:refused']);
  });

  it('writes every change through', () => {
    const { box, world } = setup({ online: false });
    const id = box.create(kopi());
    expect(world.stored).toHaveLength(1);
    box.remove(saved(id));
    expect(world.stored).toEqual([]);
  });
});
