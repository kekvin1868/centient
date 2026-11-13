// Reads the text of a payment screen or a paper receipt (from the phone's text reader) into a draft: how much,
// when, where, and its reference number. Rules only, written for Indonesian bank / e-wallet screens and shop
// receipts; a misread is expected now and then, so everything it makes waits in the Inbox for a look.
import { parseNumber, toMinor } from '@centient/money';
import { addDays } from './cycle';
import { readDay } from './readDay';

export type Reading = {
  /** A balance screen ("Saldo") is a balance check, never a payment. */
  kind: 'TRANSACTION' | 'BALANCE';
  /** Minor units, above zero; null when no amount could be found. */
  amount: number | null;
  direction: 'OUT' | 'IN';
  date: string | null;
  merchant: string | null;
  reference: string | null;
};

// A money figure: grouped thousands (25.000 / 25,000.00), or anything right after Rp / IDR.
const FIGURE =
  /(rp\.?|idr)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|(?<=(?:rp\.?|idr)\s*)\d+)(?![\d/-])/gi;
// The line that names what was paid, the surest first.
const PAID = [
  /total (bayar|pembayaran|tagihan|belanja)/i,
  /grand total/i,
  /(?<!sub ?)total/i,
  /jumlah|nominal|amount/i,
  /(kamu|anda) membayar|dibayar|bayar/i,
];
// Lines whose figures are never the amount paid.
const NOT_PAID = /saldo|kembali|tunai|cash|diskon|discount|admin|biaya|limit|sub ?total|ppn|pajak/i;
const SALDO = /saldo/i;
const PAYMENT_WORDS = /berhasil|sukses|transfer|pembayaran|bayar|total|qris|struk|belanja/i;
const MONEY_IN =
  /uang masuk|dana masuk|(kamu|anda) menerima|diterima dari|transfer masuk|pembayaran diterima/i;
const TO =
  /^(?:ke|kepada|penerima|nama penerima|merchant|nama merchant|tujuan|toko|dibayar ke)\b\s*:?\s*(.*)$/i;
const TO_INLINE = /\bke\s+([A-Z][\w .&'-]{2,40})$/;
const GENERIC =
  /berhasil|sukses|pembayaran|transaksi|transfer|qris|bukti|struk|receipt|detail|rincian|terima kasih|metode|waktu|tanggal/i;
const REFERENCE =
  /(?:ref(?:erensi|erence)?|rrn|id transaksi|trx id)\b[^A-Z0-9]{0,6}(?:no\.?\W{0,2})?([A-Z0-9][A-Z0-9 ]{5,30})/i;
// A photo is of a payment made lately: a date further back than this, or ahead, is a misread.
const OLDEST_DAYS = 400;

function figures(line: string, currency: string): { value: number; marked: boolean }[] {
  return [...line.matchAll(FIGURE)].flatMap(m => {
    const n = parseNumber(m[2]);
    return n ? [{ value: toMinor(n, currency), marked: Boolean(m[1]) }] : [];
  });
}

export function readReceipt(rawText: string, today: string, currency = 'IDR'): Reading {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const at = (i: number) => figures(lines[i] ?? '', currency);
  // The figure a label points at: the last one on its line, else the first on the next line.
  const beside = (i: number) => at(i).at(-1)?.value ?? at(i + 1)[0]?.value ?? null;

  const balance = lines.some(l => SALDO.test(l)) && !lines.some(l => PAYMENT_WORDS.test(l));
  let amount: number | null = null;
  if (balance) amount = beside(lines.findIndex(l => SALDO.test(l)));
  else {
    for (const label of PAID) {
      // Totals sit at the bottom, so the last line with the label wins.
      const i = lines.findLastIndex(l => label.test(l) && !NOT_PAID.test(l.replace(label, '')));
      if (i >= 0 && (amount = beside(i)) !== null) break;
    }
    if (amount === null) {
      const rest = lines.filter(l => !NOT_PAID.test(l)).flatMap(l => figures(l, currency));
      const marked = rest.filter(f => f.marked);
      const pick = (marked.length ? marked : rest).map(f => f.value);
      amount = pick.length ? Math.max(...pick) : null;
    }
  }

  const found = lines.map(l => readDay(l)).find(Boolean) ?? null;
  const date =
    found && found >= addDays(today, -OLDEST_DAYS) && found <= addDays(today, 1) ? found : null;

  let merchant: string | null = null;
  for (let i = 0; i < lines.length && !merchant; i++) {
    const to = lines[i].match(TO);
    if (to) merchant = to[1] || lines[i + 1] || null;
    else merchant = lines[i].match(TO_INLINE)?.[1] ?? null;
  }
  merchant ??= lines.find(l => /[A-Za-z]{3}/.test(l) && !/\d/.test(l) && !GENERIC.test(l)) ?? null;

  const ref = rawText.match(REFERENCE)?.[1].replace(/\s+/g, '') ?? null;

  return {
    kind: balance ? 'BALANCE' : 'TRANSACTION',
    amount,
    direction: !balance && MONEY_IN.test(rawText) ? 'IN' : 'OUT',
    date,
    merchant: merchant?.slice(0, 120) ?? null,
    reference: ref && /\d/.test(ref) ? ref : null,
  };
}
