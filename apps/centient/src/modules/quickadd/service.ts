// Quick add use cases: one line of text -> drafts -> saved entries, learning the merchants the user corrects.
import { parseQuickAdd, type Draft, type QAContext } from '@centient/quickadd';
import type { ServiceDeps } from '../../context';
import type { Command } from '../../lib/schemas';
import { jakartaToday } from '../../domain/cycle';
import type { LedgerService } from '../ledger/service';

export function createQuickaddService({ ws, now, repos, catalog, ledger }: ServiceDeps & { ledger: LedgerService }) {
  /** Everything the quick-add parser needs, so the client can preview drafts while typing. */
  async function context(): Promise<QAContext> {
    const [c, aliases, merchantHistory, lastAccountId] = await Promise.all([
      catalog.load(), repos.aliases.list(ws), repos.entries.merchantHistory(ws), repos.entries.lastAccountId(ws),
    ]);
    const accounts = c.accounts.filter(a => !a.archived_at);
    return {
      today: jakartaToday(now()),
      accounts,
      categories: c.categories.filter(x => !x.archived_at),
      aliases, merchantHistory,
      // Before any spending exists, default to the first everyday account.
      lastAccountId: lastAccountId ?? accounts.find(a => ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH'].includes(a.kind))?.id ?? null,
    };
  }

  return {
    context,

    async parse(text: string): Promise<Draft[]> {
      return parseQuickAdd(text, await context());
    },

    /** Saves reviewed drafts; a merchant the user corrected is learned as an alias for next time. */
    async save(items: { command: Command; rawMerchant?: string; suggestedMerchant?: string }[]) {
      const ids = await ledger.record(items.map(i => i.command));
      for (const i of items) {
        const merchant = 'merchant' in i.command ? i.command.merchant?.trim() : undefined;
        if (i.rawMerchant && merchant && i.suggestedMerchant !== undefined && merchant !== i.suggestedMerchant) {
          await repos.aliases.save(ws, { alias: i.rawMerchant.toLowerCase(), kind: 'MERCHANT', value: merchant });
        }
      }
      return ids;
    },
  };
}
