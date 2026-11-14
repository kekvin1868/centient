// Delete account: after it, nothing of the person is left in any table or in the file store, and another
// person's data is untouched.
import { describe, expect, it } from 'vitest';
import type { FileStore } from '../src/repos/files';
import { world } from './world';

const NOW = Date.parse('2026-11-13T03:00:00Z');

/** A person with a bit of everything the app can hold. */
async function filled(w: ReturnType<typeof world>, email: string) {
  let { userId, workspaceId: ws } = await w.repos.workspaces.ensure(email);
  // A reset leaves the first workspace behind (flagged); deleting the account must take it too.
  await w
    .svc(ws, { id: userId, email })
    .accounts.create({ name: 'Old', kind: 'BANK', openingBalance: 1 });
  await w.svc(ws, { id: userId, email }).workspace.reset();
  ({ workspaceId: ws } = await w.repos.workspaces.ensure(email));
  const svc = () => w.svc(ws, { id: userId, email });
  const cat = (name: string) =>
    w.repos.categories.list(ws).then(cs => cs.find(c => c.name === name)!.id);
  const food = await cat('Food & Drink');
  const bca = await svc().accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
  const card = await svc().accounts.create({ name: 'Card', kind: 'CREDIT_CARD', dueDay: 5 });
  await svc().accounts.update(bca.id, { name: 'BCA Utama' });
  const pocket = await svc().pockets.create({ accountId: bca.id, name: 'Jajan', kind: 'SPENDING' });
  await svc().budgets.set({ categoryId: food, envelopeId: pocket.id, limit: 1_000_000 });
  const [bill] = await svc().ledger.record([
    {
      type: 'EXPENSE',
      accountId: bca.id,
      categoryId: food,
      amount: 90_000,
      date: '2026-11-12',
      merchant: 'Warung',
      split: { people: 3, parties: [{ name: 'Andi', share: 30_000 }, { share: 30_000 }] },
    },
  ]);
  await svc().ledger.setIcon(bill, { icon: '🍜', forMerchant: true });
  await w.repos.tickets.answer(ws, 'ticket-1', 'POST /api/transactions x', 201, null);
  await svc().quickadd.save([
    {
      command: {
        type: 'EXPENSE',
        accountId: bca.id,
        categoryId: food,
        amount: 25_000,
        date: '2026-11-12',
        merchant: 'kopi senja',
      },
      rawMerchant: 'ks',
      suggestedMerchant: 'ks',
    },
  ]);
  const plan = await svc().installments.create({
    accountId: card.id,
    name: 'Phone',
    amountPerInstallment: 500_000,
    installments: 3,
    firstDue: '2026-12-05',
    paidCount: 0,
    myShare: 250_000,
    others: [{ name: 'Budi', share: 250_000 }],
    alreadyInBalance: false,
    categoryId: await cat('Shopping'),
  });
  await svc().installments.markPaid(plan.id, 1, 0, { fromAccountId: bca.id });
  await svc().installments.attachProof(plan.id, 1, 0, {
    name: 'proof.png',
    type: 'image/png',
    bytes: new Uint8Array([1, 2, 3]).buffer,
  });
  await svc().recurring.create({
    name: 'Netflix',
    accountId: bca.id,
    categoryId: await cat('Fun'),
    amount: 120_000,
    everyMonths: 1,
    nextDue: '2026-11-20',
  });
  await svc().recurring.hide('gym');
  await svc().inbox.importRows([{ date: '2026-11-10', amount: -5_000, accountId: bca.id }]);
  await w.repos.lock.addPasskey(userId, { id: `cred-${email}`, public_key: 'AAAA', counter: 0 });
  await w.repos.push.save(userId, {
    endpoint: `https://web.push.apple.com/${email}`,
    p256dh: 'k',
    auth: 'a',
  });
  await w.repos.lock.setChallenge(userId, 'c', new Date(NOW + 1000).toISOString());
  await w.repos.lock.startSession(
    userId,
    new Date(NOW).toISOString(),
    new Date(NOW + 1000).toISOString(),
  );
  return { userId, ws, svc };
}

/** Rows per table, for every table in the database. */
function counts(w: ReturnType<typeof world>) {
  const names = w.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  return names.then(async r =>
    Object.fromEntries(
      await Promise.all(
        r.results.map(async t => [
          t.name,
          (await w.db.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).first<{ n: number }>())!.n,
        ]),
      ),
    ),
  ) as Promise<Record<string, number>>;
}

describe('delete account', () => {
  it('erases every row and file of the person and nothing of anyone else', async () => {
    const files = new Map<string, unknown>();
    const store: FileStore = {
      async put(k, body, contentType) {
        files.set(k, { body, contentType });
      },
      async get() {
        return null;
      },
      async delete(keys) {
        for (const k of keys) files.delete(k);
      },
    };
    const w = world({ now: () => NOW, store });
    // Tables that are the same for everyone, not a person's data.
    const shared = await counts(w);
    const other = await filled(w, 'stays@test');
    const kept = await counts(w);
    const filesKept = files.size;
    const me = await filled(w, 'goes@test');
    const full = await counts(w);
    // The fixture really touches every table a person's data can be in: none is left as it was.
    const untouched = Object.keys(full).filter(t => full[t] === kept[t] && full[t] === shared[t]);
    expect(untouched.filter(t => !['currencies', 'prices', 'd1_migrations'].includes(t))).toEqual([
      'envelope_categories',
      'statement_imports',
      'budget_alerts',
    ]);
    expect(files.size).toBe(filesKept + 1);

    await expect(me.svc().workspace.purge('delete')).rejects.toMatchObject({
      code: 'CONFIRM_DELETE',
    });
    expect(await counts(w)).toEqual(full);

    await me.svc().workspace.purge('DELETE');
    expect(await counts(w)).toEqual(kept);
    expect(files.size).toBe(filesKept);
    expect((await other.svc().ledger.balances()).accounts.length).toBeGreaterThan(0);

    // Signing in again starts from nothing.
    const again = await w.repos.workspaces.ensure('goes@test');
    expect(again.userId).not.toBe(me.userId);
    expect((await w.repos.workspaces.get(again.workspaceId)).onboarded_at).toBeNull();
  });
});
