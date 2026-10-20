// Quick add: one typed or dictated line becomes transaction drafts. Pure rules, no AI.
// Runs in the Worker today; the PWA can import it once it has a bundler.
import { parseAmount, type Amount } from '@centient/money';
import {
  ABBREVIATIONS, CASH_WORDS, DAY_NAMES, DEFAULT_RANGE, FILLER, HOKKIEN_AMBIGUOUS, HOKKIEN_DIGITS,
  HOKKIEN_EXACT, HOKKIEN_UNITS, INCOME_WORDS, KEYWORDS, MERCHANT_ALIASES, PROVIDER_ALIASES,
  TRANSFER_WORDS, VERBS, type Hint,
} from './dictionary';

export type QAAccount = { id: string; name: string; kind: string; provider: string | null };
export type QACategory = { id: string; name: string; kind: 'EXPENSE' | 'INCOME' };
export type QAAlias = { alias: string; kind: 'MERCHANT' | 'ACCOUNT' | 'CATEGORY'; value: string };
export type QAContext = {
  today: string; // YYYY-MM-DD, Asia/Jakarta
  accounts: QAAccount[];
  categories: QACategory[];
  aliases?: QAAlias[];
  /** Past amounts and last category per lowercase merchant name. */
  merchantHistory?: Record<string, { min: number; max: number; categoryId: string | null }>;
  lastAccountId?: string | null;
};

export type Draft = {
  text: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  /** null = the user must pick one of `candidates` (or type it). */
  amount: number | null;
  candidates: number[];
  /** True whenever the amount was inferred, not written: the UI asks to confirm it. */
  needsConfirm: boolean;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  merchant: string;
  /** The words the merchant came from; a corrected merchant is learned under this key. */
  rawMerchant: string;
  date: string;
  split: number | null;
  fee: number | null;
  note: string;
};

const SUFFIXES = new Set(['rb', 'ribu', 'k', 'jt', 'juta', 'm']);

export function parseQuickAdd(input: string, ctx: QAContext): Draft[] {
  const text = input
    .replace(/\btop\s+up\b/gi, 'top-up')
    .replace(/\bkartu\s+kredit\b/gi, 'kartu-kredit')
    .replace(/\bkemarin\s+lusa\b/gi, 'kemarin-lusa')
    .replace(/\bcepek\s+ceng\b/gi, 'cepekceng');
  const parts = text.split(/\s+(?:dan|and|&|\+)\s+|;|\n|,\s+/i).map(s => s.trim()).filter(Boolean);
  const drafts: Draft[] = [];
  for (const part of parts) {
    const { draft, hasAmount } = parsePart(part, ctx);
    const prev = drafts.at(-1);
    // A part without an amount ("dan es teh") is a note on the entry before it.
    if (!hasAmount && prev) prev.note = `${prev.note} ${part}`.trim();
    else drafts.push(draft);
  }
  return drafts;
}

function parsePart(part: string, ctx: QAContext): { draft: Draft; hasAmount: boolean } {
  const words = part.toLowerCase().split(/\s+/).map(w => ABBREVIATIONS[w] ?? w);
  let amount: Amount | null = null;
  let split: number | null = null;
  let fee: number | null = null;
  let date = ctx.today;
  let income = false, transfer = false, topUp = false;
  let role: 'from' | 'to' | null = null;
  let from: string | null = null, to: string | null = null;
  const mentions: string[] = [];
  const hints: string[] = [];
  const merchantWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    const next = words[i + 1];
    if ((w === 'rp' || w === 'rp.' || w === 'idr') && next && /^\d/.test(next)) { w = w + next; i++; }

    if ((w === 'bagi' || w === 'split') && next && /^\d+$/.test(next)) { split = Number(next); i++; continue; }
    if (w === 'tanggal' && next && /^\d{1,2}$/.test(next)) { date = dayOfMonth(ctx.today, Number(next)); i++; continue; }
    if (w === 'kemarin') { date = addDays(ctx.today, -1); continue; }
    if (w === 'kemarin-lusa') { date = addDays(ctx.today, -2); continue; }
    if (w in DAY_NAMES) { date = lastWeekday(ctx.today, DAY_NAMES[w]); continue; }
    if (w === 'biaya' && next === 'admin') continue;
    if (w === 'admin') {
      const a = readAmount(words, i + 1);
      if (a) { fee = a.amount.kind === 'exact' ? a.amount.value : (a.amount.kind === 'inferred' ? a.amount.candidates[1] : null); i += a.used; }
      continue;
    }

    if (!amount) {
      const a = readAmount(words, i);
      if (a) { amount = a.amount; i += a.used - 1; continue; }
    }

    if (w === 'pakai' || w === 'via' || w === 'dari') { role = 'from'; continue; }
    if (w === 'ke') { role = 'to'; continue; }
    if (w === 'isi' || w === 'top-up') {
      // "isi gopay" is a top-up; "isi bensin" is not.
      if (w === 'top-up' || matchAccount(words, i + 1, ctx)) { transfer = true; topUp = true; }
      else merchantWords.push(w);
      continue;
    }

    const acc = matchAccount(words, i, ctx);
    if (acc) {
      if (role === 'from') from = acc.id;
      else if (role === 'to') to = acc.id;
      else mentions.push(acc.id);
      role = null;
      i += acc.used - 1;
      continue;
    }
    role = null;

    if (INCOME_WORDS.has(w)) { income = true; hints.push(w); continue; }
    // "tarik tunai" moves money into the cash account, like a top-up.
    if (TRANSFER_WORDS.has(w)) { transfer = true; if (w === 'tarik') topUp = true; continue; }
    if (VERBS.has(w)) { hints.push(w); continue; }
    if (FILLER.has(w)) continue;
    merchantWords.push(w);
  }

  const type: Draft['type'] = transfer ? 'TRANSFER' : income ? 'INCOME' : 'EXPENSE';
  for (const id of mentions) {
    if (type !== 'TRANSFER') from ??= id;
    else if (topUp && !to) to = id;
    else if (!from) from = id;
    else to ??= id;
  }
  const last = ctx.lastAccountId ?? null;
  if (!from && last && last !== to) from = last;
  if (type === 'TRANSFER' && !to && last && last !== from) to = last;

  const { merchant, rawMerchant } = resolveMerchant(merchantWords, ctx);
  const history = ctx.merchantHistory?.[merchant.toLowerCase()];
  const hint = findHint([...hints, ...merchant.toLowerCase().split(/\s+/)], type);
  const categoryId = type === 'TRANSFER' ? null
    : history?.categoryId ?? categoryFromAlias(merchantWords, ctx) ?? categoryId_(hint?.category ?? (type === 'INCOME' ? 'Other income' : null), ctx);
  const range: [number, number] = history ? [history.min / 3, history.max * 3] : hint?.range ?? DEFAULT_RANGE;

  let value: number | null = null;
  let candidates: number[] = [];
  let needsConfirm = false;
  if (amount?.kind === 'exact') value = amount.value;
  else if (amount?.kind === 'inferred') {
    candidates = amount.candidates;
    const fits = candidates.filter(c => c >= range[0] && c <= range[1]);
    value = fits.length === 1 ? fits[0] : null;
    needsConfirm = true;
  } else if (amount?.kind === 'ambiguous_m') {
    candidates = [amount.value * 1e6, amount.value * 1e9];
    needsConfirm = true;
  }

  return {
    hasAmount: amount !== null,
    draft: {
      text: part, type, amount: value, candidates, needsConfirm,
      accountId: from, toAccountId: type === 'TRANSFER' ? to : null, categoryId,
      merchant, rawMerchant, date, split: type === 'EXPENSE' && split && split > 1 ? split : null,
      fee, note: '',
    },
  };
}

/** Reads an amount at words[i]: "25rb", "25 rb", "rp52.500", Hokkien words. */
function readAmount(words: string[], i: number): { amount: Amount; used: number } | null {
  const w = words[i];
  if (!w) return null;
  const next = words[i + 1];
  if (/^\d/.test(w) && next && SUFFIXES.has(next)) {
    const a = parseAmount(w + next);
    if (a) return { amount: a, used: 2 };
  }
  const a = parseAmount(w);
  if (a) return { amount: a, used: 1 };
  if (w === 'cepekceng') return { amount: { kind: 'exact', value: 100_000 }, used: 1 };
  if (w in HOKKIEN_EXACT) return { amount: { kind: 'exact', value: HOKKIEN_EXACT[w] }, used: 1 };
  if (w in HOKKIEN_AMBIGUOUS) return { amount: { kind: 'inferred', candidates: HOKKIEN_AMBIGUOUS[w] }, used: 1 };
  const m = w.match(/^(ce|se|it|no|ji|sa|si|go|lak|cit|pek|kau)(ceng|ban|tiao)$/);
  if (m) return { amount: { kind: 'exact', value: HOKKIEN_DIGITS[m[1]] * HOKKIEN_UNITS[m[2]] }, used: 1 };
  return null;
}

/** Matches an account at words[i] by workspace alias, "kartu-kredit <provider>", name, provider word or cash word. */
function matchAccount(words: string[], i: number, ctx: QAContext): { id: string; used: number } | null {
  const active = ctx.accounts;
  for (const len of [3, 2, 1]) {
    if (i + len > words.length) continue;
    const phrase = words.slice(i, i + len).join(' ');
    const alias = ctx.aliases?.find(a => a.kind === 'ACCOUNT' && a.alias === phrase);
    if (alias && active.some(a => a.id === alias.value)) return { id: alias.value, used: len };
    const byName = active.find(a => a.name.toLowerCase() === phrase);
    if (byName) return { id: byName.id, used: len };
  }
  const w = words[i];
  if (w === 'kartu-kredit') {
    const provider = PROVIDER_ALIASES[words[i + 1] ?? ''];
    const card = active.find(a => a.kind === 'CREDIT_CARD' && (!provider || a.provider === provider));
    return card ? { id: card.id, used: provider ? 2 : 1 } : null;
  }
  const provider = PROVIDER_ALIASES[w];
  if (provider) {
    // A bare "bca" means the bank account, not the BCA credit card.
    const matches = active.filter(a => a.provider === provider);
    const pick = matches.find(a => a.kind !== 'CREDIT_CARD') ?? matches[0];
    if (pick) return { id: pick.id, used: 1 };
  }
  if (CASH_WORDS.has(w)) {
    const cash = active.find(a => a.kind === 'CASH');
    if (cash) return { id: cash.id, used: 1 };
  }
  return null;
}

function resolveMerchant(words: string[], ctx: QAContext): { merchant: string; rawMerchant: string } {
  const rawMerchant = words.join(' ');
  const ws = (k: string) => ctx.aliases?.find(a => a.kind === 'MERCHANT' && a.alias === k)?.value;
  const whole = ws(rawMerchant);
  if (whole) return { merchant: whole, rawMerchant };
  const merchant = words.map(w => ws(w) ?? MERCHANT_ALIASES[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { merchant, rawMerchant };
}

function categoryFromAlias(words: string[], ctx: QAContext): string | null {
  for (const w of words) {
    const id = ctx.aliases?.find(a => a.kind === 'CATEGORY' && a.alias === w)?.value;
    if (id) return id;
  }
  return null;
}

const INCOME_CATEGORIES = new Set(['Salary', 'Angpao & THR', 'Interest & cashback', 'Other income']);

function findHint(words: string[], type: Draft['type']): Hint | null {
  for (const w of words) {
    const h = KEYWORDS[w];
    if (h && INCOME_CATEGORIES.has(h.category) === (type === 'INCOME')) return h;
  }
  return null;
}

function categoryId_(name: string | null, ctx: QAContext): string | null {
  if (!name) return null;
  return ctx.categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}

// Dates are plain YYYY-MM-DD strings; UTC arithmetic keeps them from shifting by time zone.
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lastWeekday(today: string, weekday: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  return addDays(today, -((d.getUTCDay() - weekday + 7) % 7));
}

function dayOfMonth(today: string, day: number): string {
  let [y, m] = today.split('-').map(Number);
  if (day > Number(today.slice(8, 10))) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
