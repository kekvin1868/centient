// Reading a spreadsheet (CSV) for import: which column is what, dates, amounts, and which rows are skipped.
// Pure; the rows it makes are sent with inboxApi.import (./inbox).
import { parseNumber, toMinor } from '@centient/money';
import type { ImportRow } from './inbox';

/** The most rows one import takes (the server's limit). */
export const IMPORT_MAX = 5000;

// ---- Reading a spreadsheet ----

/** What a column can be. Date and amount are needed; the rest are extras. */
export const FIELDS = [
  { key: 'date', label: 'Date', needed: true },
  { key: 'amount', label: 'Amount (or money out)', needed: true },
  { key: 'income', label: 'Money in, if its own column', needed: false },
  { key: 'type', label: 'Income or expense', needed: false },
  { key: 'merchant', label: 'Where / what', needed: false },
  { key: 'note', label: 'Note', needed: false },
  { key: 'category', label: 'Category', needed: false },
] as const;
export type Field = (typeof FIELDS)[number]['key'];
/** Which column (by position) holds each field; null = the file has none. */
export type Mapping = Record<Field, number | null>;

// Header words per field, most telling first. English, Indonesian, and this app's own export.
const HEADER_WORDS: Record<Field, string[]> = {
  date: ['date', 'tanggal', 'tgl', 'time', 'waktu'],
  amount: ['amount', 'jumlah', 'nominal', 'debit', 'debet', 'keluar', 'money out', 'expense'],
  income: ['credit', 'kredit', 'masuk', 'money in'],
  type: ['type', 'income/expense', 'jenis', 'tipe'],
  merchant: ['merchant', 'payee', 'description', 'keterangan', 'deskripsi', 'title', 'name'],
  note: ['note', 'memo', 'catatan', 'comment'],
  category: ['category', 'kategori'],
};

/** A first guess at the mapping from the header row; a column is used once. */
export function guessMapping(headers: string[]): Mapping {
  const names = headers.map(h => h.trim().toLowerCase());
  const used = new Set<number>();
  const find = (words: string[]) => {
    for (const word of words) {
      const i = names.findIndex((n, k) => !used.has(k) && (n === word || n.startsWith(word)));
      if (i >= 0) {
        used.add(i);
        return i;
      }
    }
    return null;
  };
  const guess = (f: Field) => find(HEADER_WORDS[f]);
  return {
    date: guess('date'),
    amount: guess('amount'),
    income: guess('income'),
    type: guess('type'),
    merchant: guess('merchant'),
    note: guess('note'),
    category: guess('category'),
  };
}

export type DayOrder = 'DMY' | 'MDY';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_ID: Record<string, string> = { mei: 'may', agu: 'aug', okt: 'oct', des: 'dec' };
const monthOf = (word: string) => {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.indexOf(MONTHS_ID[w] ?? w) + 1;
};
const dayOf = (y: number, m: number, d: number) => {
  const year = y < 100 ? 2000 + y : y;
  const day = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Round-trips only for a real calendar day (no 31 February, no month 13).
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day ? day : null;
};

/** A date cell as YYYY-MM-DD, or null: 2026-11-10 (with or without a time), 10/11/2026, 10-11-26, 10 Nov 2026, Nov 10, 2026. */
export function parseDay(text: string, order: DayOrder): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (m) return dayOf(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\D|$)/);
  if (m) return order === 'DMY' ? dayOf(+m[3], +m[2], +m[1]) : dayOf(+m[3], +m[1], +m[2]);
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -,]+(\d{4}|\d{2})/);
  if (m) return dayOf(+m[3], monthOf(m[2]), +m[1]);
  m = t.match(/^([A-Za-z]{3,}) (\d{1,2}),? (\d{4})/);
  if (m) return dayOf(+m[3], monthOf(m[1]), +m[2]);
  return null;
}

/** Month-first only when the dates prove it (a second number above 12 and never a first one); else day-first. */
export function guessDayOrder(cells: string[]): DayOrder {
  const pairs = cells.flatMap(c => {
    const m = c.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    return m ? [[+m[1], +m[2]]] : [];
  });
  return pairs.some(p => p[1] > 12) && !pairs.some(p => p[0] > 12) ? 'MDY' : 'DMY';
}

/** A money cell in the currency's minor units, signed, or null: "Rp 25.000", "-25,000.00", "(25000)", "1.250,5". */
export function parseMoney(text: string, currency: string): number | null {
  const t = text.trim();
  const negative = /^-|^\(.*\)$|-$/.test(t);
  const digits = t.replace(/[^\d.,]/g, '');
  const n = digits ? parseNumber(digits) : null;
  if (n === null) return null;
  return (negative ? -1 : 1) * toMinor(n, currency);
}

export type ImportOptions = {
  accountId: string;
  currency: string;
  order: DayOrder;
  /** What an amount without a sign, a type or its own column means. */
  plain: 'out' | 'in';
  /** Categories a category cell may name. */
  categories: { id: string; name: string; kind: string }[];
};
export type Skipped = { line: number; why: string };

const INCOME_WORDS = /^(inc|in$|pemasukan|masuk|credit|kredit|cr$)/i;
const MOVE_WORDS = /transfer|allocate|pindah|mutasi antar/i;

/**
 * Turns a file's rows (without its header) into payments. A row that can't be read is skipped with the reason
 * and its line in the file. Money moved between your own accounts is skipped too: do that in the app.
 */
export function toRows(
  table: string[][],
  map: Mapping,
  o: ImportOptions,
): { rows: ImportRow[]; skipped: Skipped[] } {
  const rows: ImportRow[] = [];
  const skipped: Skipped[] = [];
  const cell = (r: string[], f: Field) => (map[f] === null ? '' : (r[map[f]] ?? ''));
  table.forEach((r, k) => {
    const skip = (why: string) => skipped.push({ line: k + 2, why });
    const type = cell(r, 'type');
    if (MOVE_WORDS.test(type)) return skip('a move between accounts');
    const date = parseDay(cell(r, 'date'), o.order);
    if (!date) return skip(`no date in "${cell(r, 'date')}"`);
    const out = parseMoney(cell(r, 'amount'), o.currency);
    const inn = parseMoney(cell(r, 'income'), o.currency);
    // Its own "money in" column wins; then a minus sign; then the type column; then the picked default.
    const amount = inn
      ? Math.abs(inn)
      : out === null || out === 0
        ? null
        : out < 0
          ? out
          : (type ? INCOME_WORDS.test(type) : o.plain === 'in')
            ? out
            : -out;
    if (amount === null) return skip(`no amount in "${cell(r, 'amount')}"`);
    const named = cell(r, 'category').toLowerCase();
    const category = o.categories.find(
      c => c.name.toLowerCase() === named && c.kind === (amount < 0 ? 'EXPENSE' : 'INCOME'),
    );
    rows.push({
      date,
      amount,
      merchant: cell(r, 'merchant').slice(0, 120) || undefined,
      note: cell(r, 'note').slice(0, 500) || undefined,
      accountId: o.accountId,
      categoryId: category?.id,
    });
  });
  return { rows, skipped };
}

/** True when nothing in the file says which way money went, so the owner has to. */
export const needsPlain = (table: string[][], map: Mapping, currency: string) =>
  map.type === null &&
  map.income === null &&
  map.amount !== null &&
  !table.some(r => (parseMoney(r[map.amount!] ?? '', currency) ?? 0) < 0);
