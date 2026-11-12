// Inbox use cases: bring payments in (a CSV import, or the text read from a photo), review them (add as a new
// entry, link to the entry that is already there, or dismiss), and undo a whole import.
import type { ServiceDeps } from '../../context';
import { addDays, jakartaToday, realDay } from '../../domain/cycle';
import { suggestDuplicates } from '../../domain/inbox';
import { DomainError } from '../../domain/ledger';
import { readReceipt } from '../../domain/receipt';
import type { Snapshot } from '../../lib/catalog';
import type { Command } from '../../lib/schemas';
import type { InboxItem } from '../../repos/inbox';
import type { AccountsService } from '../accounts/service';
import type { LedgerService } from '../ledger/service';

type Row = {
  date: string;
  /** Signed: below zero is money out. */
  amount: number;
  merchant?: string;
  note?: string;
  accountId: string;
  categoryId?: string | null;
};

// D1 takes a batch of statements at a time; the ledger takes 50 commands. Both stay well inside their limits.
const INSERT_BATCH = 100;
const LEDGER_BATCH = 50;
const REVIEW_LIMIT = 500;
const chunks = <T>(rows: T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

export function createInboxService({
  ws,
  now,
  repos,
  catalog,
  ledger,
  accounts,
}: ServiceDeps & { ledger: LedgerService; accounts: AccountsService }) {
  type Reviewed = InboxItem & { suggested: string | null };

  async function reviewable(id: string): Promise<Reviewed> {
    const item = await repos.inbox.get(ws, id);
    if (!item) throw new DomainError('NOT_FOUND', 'Not in the Inbox');
    if (item.status !== 'REVIEW') throw new DomainError('INBOX_DONE', 'Already reviewed');
    return item;
  }

  /** The category kind an amount needs: money out is spending, money in is income. */
  const kindOf = (amount: number) => (amount < 0 ? 'EXPENSE' : 'INCOME');

  /** An item with everything an entry needs; a photo may lack its amount or its account. */
  function complete(item: InboxItem): InboxItem & { amount: number; account_id: string } {
    if (item.amount === null || item.account_id === null)
      throw new DomainError('INBOX_INCOMPLETE', 'Open it and fill in what is missing first');
    return { ...item, amount: item.amount, account_id: item.account_id };
  }

  /** The entry an item becomes; without a category it goes to "Other" (or "Other income"), like quick add. */
  function commandOf(c: Snapshot, raw: InboxItem): Command {
    const item = complete(raw);
    const fallback = c.categoryByName(item.amount < 0 ? 'Other' : 'Other income');
    const categoryId = item.category_id ?? fallback?.id;
    if (!categoryId) throw new DomainError('NO_CATEGORY', 'Pick a category for this one first');
    return {
      type: kindOf(item.amount),
      accountId: item.account_id,
      categoryId,
      amount: Math.abs(item.amount),
      date: item.occurred_at,
      merchant: item.merchant ?? undefined,
      note: item.note ?? undefined,
    };
  }

  /**
   * Saves these items as entries and marks them SAVED, each ledger batch with its marks in one write.
   * `as` is the entry to save instead of the item's own reading (the owner corrected it in the form).
   */
  async function addItems(items: InboxItem[], as?: Command) {
    const c = await catalog.load();
    for (const batch of chunks(items, LEDGER_BATCH)) {
      const { ids, stmts } = await ledger.recordStatements(batch.map(i => as ?? commandOf(c, i)));
      await repos.batch([
        ...stmts,
        ...batch.map((item, k) =>
          repos.inbox.updateStatement(ws, item.id, { status: 'SAVED', entry_id: ids[k] }),
        ),
      ]);
    }
    return items.length;
  }

  const view = (i: Reviewed) => {
    const [date, merchant] = i.suggested?.split('|') ?? [];
    return {
      id: i.id,
      source: i.source,
      kind: i.kind,
      importId: i.import_id,
      date: i.occurred_at,
      amount: i.amount,
      merchant: i.merchant,
      note: i.note,
      accountId: i.account_id,
      categoryId: i.category_id,
      /** The saved entry this one looks like, if it is still there. */
      suggested: i.suggested ? { entryId: i.suggested_entry_id!, date, merchant } : null,
    };
  };

  return {
    /**
     * Brings parsed CSV rows in as REVIEW items sharing one import id, each with the saved entry it may
     * duplicate. Importing the same file again adds nothing: a row is known by its account, day, amount,
     * merchant and its place among identical rows.
     */
    async importRows(rows: Row[]) {
      const c = await catalog.load();
      for (const r of rows) {
        if (!realDay(r.date)) throw new DomainError('VALIDATION', `${r.date} is not a real date`);
        if (c.account(r.accountId).row.kind === 'IOU')
          throw new DomainError('INBOX_ACCOUNT', "Payments can't be imported into a person's tab");
        if (r.categoryId) c.category(r.categoryId, kindOf(r.amount));
      }
      const days = rows.map(r => r.date).sort();
      const lines = await repos.inbox.lines(ws, addDays(days[0], -1), addDays(days.at(-1)!, 1));
      const suggested = suggestDuplicates(
        rows,
        lines.map(l => ({
          entryId: l.entry_id,
          accountId: l.account_id,
          amount: l.amount,
          day: l.day,
        })),
      );
      const importId = crypto.randomUUID();
      const seen = new Map<string, number>();
      const items = rows.map((r, k) => {
        const merchant = r.merchant?.trim() || null;
        const same = `${r.accountId}|${r.date}|${r.amount}|${merchant?.toLowerCase() ?? ''}`;
        const nth = seen.get(same) ?? 0;
        seen.set(same, nth + 1);
        return {
          source: 'CSV',
          import_id: importId,
          content_hash: `csv|${same}|${nth}`,
          amount: r.amount,
          occurred_at: r.date,
          merchant,
          note: r.note?.trim() || null,
          account_id: r.accountId,
          category_id: r.categoryId ?? null,
          suggested_entry_id: suggested[k],
        };
      });
      let added = 0;
      for (const batch of chunks(repos.inbox.insertStatements(ws, items), INSERT_BATCH))
        for (const r of await repos.batch(batch)) added += r.meta.changes;
      return { importId, added, skipped: rows.length - added };
    },

    /**
     * Brings in one payment from the text the phone read off a photo or a screenshot (`contentHash` names the
     * picture). The rules in domain/receipt make a draft; it always waits for review. The same picture or the
     * same reference number again is refused (a UNIQUE error, sent as 409 DUPLICATE).
     */
    async capture(i: {
      source: 'UPLOAD' | 'SCREENSHOT' | 'TEXT';
      rawText: string;
      contentHash?: string;
      accountId?: string | null;
    }) {
      const c = await catalog.load();
      const account = i.accountId ? c.account(i.accountId) : null;
      if (account?.row.kind === 'IOU')
        throw new DomainError('INBOX_ACCOUNT', "A payment can't be read into a person's tab");
      const today = jakartaToday(now());
      const r = readReceipt(i.rawText, today, account?.currency);
      const date = r.date ?? today;
      // A balance is what the screen shows (kept as read); a payment is signed by its direction.
      const amount =
        r.amount === null || r.kind === 'BALANCE' || r.direction === 'IN' ? r.amount : -r.amount;
      const [suggested] =
        amount !== null && r.kind === 'TRANSACTION'
          ? suggestDuplicates(
              [{ accountId: account?.id ?? null, amount, date }],
              (await repos.inbox.lines(ws, addDays(date, -1), addDays(date, 1))).map(l => ({
                entryId: l.entry_id,
                accountId: l.account_id,
                amount: l.amount,
                day: l.day,
              })),
            )
          : [null];
      const id = crypto.randomUUID();
      const [insert] = repos.inbox.insertStatements(
        ws,
        [
          {
            id,
            source: i.source,
            kind: r.kind,
            import_id: null,
            content_hash: i.contentHash ? `img|${i.contentHash}` : null,
            external_ref: r.reference ?? undefined,
            amount,
            occurred_at: date,
            merchant: r.merchant,
            note: null,
            account_id: account?.id ?? null,
            category_id: null,
            suggested_entry_id: suggested,
            raw_text: i.rawText,
          },
        ],
        false,
      );
      await insert.run();
      return { id, kind: r.kind, read: r.amount !== null };
    },

    /** What waits for review (the oldest 500), how many in all, and the latest imports. */
    async list() {
      const [items, waiting, imports] = await Promise.all([
        repos.inbox.review(ws, { limit: REVIEW_LIMIT }),
        repos.inbox.count(ws),
        repos.inbox.imports(ws),
      ]);
      return { waiting, items: items.map(view), imports };
    },

    count: () => repos.inbox.count(ws),

    /** Changes the category an item will be added with (null = decide when adding), or the account it is for. */
    async update(id: string, i: { categoryId?: string | null; accountId?: string }) {
      const item = await reviewable(id);
      const c = await catalog.load();
      if (i.categoryId && item.amount !== null) c.category(i.categoryId, kindOf(item.amount));
      if (i.accountId && c.account(i.accountId).row.kind === 'IOU')
        throw new DomainError('INBOX_ACCOUNT', "A payment can't go into a person's tab");
      const patch: Partial<InboxItem> = {};
      if (i.categoryId !== undefined) patch.category_id = i.categoryId;
      if (i.accountId !== undefined) patch.account_id = i.accountId;
      if (Object.keys(patch).length) await repos.inbox.updateStatement(ws, id, patch).run();
    },

    /**
     * Add: the item becomes a new entry (`as`: the entry the owner made of it in the form). A balance check
     * instead sets its account to the balance read, like Update balance.
     */
    async add(id: string, as?: Command) {
      const item = await reviewable(id);
      if (item.kind === 'TRANSACTION') return void (await addItems([item], as));
      const { account_id, amount } = complete(item);
      // ponytail: two writes, not one. A retry after the first sets the same balance again, which changes nothing.
      await accounts.reconcile(account_id, { actual: amount });
      await repos.inbox.updateStatement(ws, id, { status: 'SAVED' }).run();
    },

    /** Link: the item is the entry that was suggested; nothing new is saved. */
    async link(id: string) {
      const item = await reviewable(id);
      if (!item.suggested) throw new DomainError('NO_SUGGESTION', 'Nothing to link this to');
      await repos.inbox
        .updateStatement(ws, id, { status: 'SAVED', entry_id: item.suggested_entry_id })
        .run();
    },

    async dismiss(id: string) {
      await reviewable(id);
      await repos.inbox.updateStatement(ws, id, { status: 'DISMISSED' }).run();
    },

    /** "Add all unmatched": every waiting item with no entry suggested (of one import when given) becomes an entry. */
    async addAll(importId?: string) {
      let added = 0;
      // The list is capped, so keep going until nothing unmatched is left.
      for (;;) {
        const items = (await repos.inbox.review(ws, { importId, limit: REVIEW_LIMIT })).filter(
          i =>
            !i.suggested && i.kind === 'TRANSACTION' && i.amount !== null && i.account_id !== null,
        );
        if (!items.length) return added;
        added += await addItems(items);
      }
    },

    /**
     * Undo an import: its items go, and so do the entries it created (linked entries were there before and stay).
     * ponytail: created entries are removed as they are; one the owner has since turned into a split bill with
     * Paid backs loses those links. Route it through ledger.remove if that ever happens.
     */
    async undoImport(importId: string) {
      const imports = await repos.inbox.imports(ws);
      if (!imports.some(i => i.id === importId))
        throw new DomainError('NOT_FOUND', 'Import not found');
      const entries = await repos.inbox.addedBy(ws, importId);
      for (const batch of chunks(entries, LEDGER_BATCH))
        await repos.batch(batch.flatMap(id => repos.entries.removeStatements(ws, id)));
      await repos.inbox.removeImportStatement(ws, importId).run();
      return { removedEntries: entries.length };
    },
  };
}
