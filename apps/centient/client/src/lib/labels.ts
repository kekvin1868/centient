// Emoji and plain-word titles for entries. Emoji mark categories; interface icons come from Phosphor.
import type { EntryView } from '../../../src/repos/entries';
import type { Command } from '../../../src/lib/schemas';
import { catalog, nameOf, type Catalog } from './state';

const CATEGORY_EMOJI: Record<string, string> = {
  'Food & Drink': '🍜', Transport: '🚗', 'Home & Bills': '🏠', Shopping: '🛍️', Health: '💊', Fun: '🎬',
  Education: '📚', 'Family & Giving': '💌', Fees: '🧾', Other: '📦', Salary: '💼', 'Angpao & THR': '🧧', 'Interest & cashback': '💸', 'Opening balance': '🏁',
  'Balance adjustment': '⚖️', 'Other income': '💰',
};

export function categoryEmoji(name: string | undefined, type: Command['type'] = 'EXPENSE'): string {
  if (type === 'TRANSFER') return '🔁';
  if (type === 'ALLOCATE') return '🫙';
  return (name && CATEGORY_EMOJI[name]) ?? (type === 'INCOME' ? '💰' : '🧾');
}

/** "BCA · Rent": a pocket named with its account. */
export function pocketLabel(id: string) {
  const cat = catalog.value;
  const e = cat.envelopes.find(x => x.id === id);
  return e ? `${nameOf(cat.accounts, e.account_id)} · ${e.name}` : '';
}

export const titleCase = (s: string) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());

type EntryRow = { emoji: string; title: string; sub: string; amount: number; currency: string; tone: 'out' | 'in' | 'neutral' };

/** How an entry reads in a list: from its saved command, or from its first transaction for system entries. */
export function entryRow(e: EntryView & { command: Command | null }, cat: Catalog): EntryRow {
  const row = baseRow(e, cat);
  return e.icon ? { ...row, emoji: e.icon } : row;
}

function baseRow(e: EntryView & { command: Command | null }, cat: Catalog): EntryRow {
  const name = (rows: { id: string; name: string }[], id?: string | null) => rows.find(r => r.id === id)?.name ?? '';
  const accCur = (id?: string | null) => cat.accounts.find(a => a.id === id)?.currency_code ?? 'IDR';
  const c = e.command;
  if (e.kind !== 'USER' || !c) {
    const t = e.transactions[0];
    const line = t?.entries[0];
    const category = name(cat.categories, t?.category_id);
    const opening = e.kind === 'OPENING';
    return {
      emoji: opening ? '🏁' : '⚖️',
      title: opening ? 'Starting balance' : 'Balance correction',
      sub: [name(cat.accounts, line?.account_id), !opening && category !== 'Balance adjustment' ? category : ''].filter(Boolean).join(' · '),
      amount: Math.abs(line?.amount ?? 0), currency: accCur(line?.account_id), tone: (line?.amount ?? 0) < 0 ? 'out' : 'in',
    };
  }
  switch (c.type) {
    case 'EXPENSE':
    case 'INCOME': {
      const category = name(cat.categories, c.categoryId);
      const split = c.type === 'EXPENSE' && c.split ? `split with ${c.split.people}` : '';
      return {
        emoji: categoryEmoji(category, c.type), title: c.merchant ? titleCase(c.merchant) : category || (c.type === 'EXPENSE' ? 'Spent' : 'Received'),
        sub: [c.merchant ? category : '', name(cat.accounts, c.accountId), split].filter(Boolean).join(' · '),
        amount: c.amount, currency: accCur(c.accountId), tone: c.type === 'EXPENSE' ? 'out' : 'in',
      };
    }
    case 'TRANSFER':
      return {
        emoji: '🔁', title: `${name(cat.accounts, c.fromAccountId)} → ${name(cat.accounts, c.toAccountId)}`,
        sub: ['Moved', c.fee ? 'admin fee' : '', c.note ?? ''].filter(Boolean).join(' · '),
        amount: c.amount, currency: accCur(c.fromAccountId), tone: 'neutral',
      };
    case 'ALLOCATE':
      return {
        emoji: '🫙', title: `${name(cat.envelopes, c.fromEnvelopeId)} → ${name(cat.envelopes, c.toEnvelopeId)}`,
        sub: 'Moved between pockets', amount: c.amount, currency: cat.envelopes.find(x => x.id === c.fromEnvelopeId)?.currency_code ?? 'IDR', tone: 'neutral',
      };
  }
}
