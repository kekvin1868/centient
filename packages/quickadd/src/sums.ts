// A sum typed in a quick add line and closed with "=" turns into its result, so the log never sees the equation.
// It is only maths: splitting a bill is still "bagi N".
//   "dimsum 19k/3="       -> "dimsum 6.333"
//   "(50rb+40rb)/3="      -> "30.000"
//   "25rb+18rb="          -> "43.000"
// A sum that can't be worked out (5/0=, a missing bracket) is left as typed.
import { evalAmount } from '@centient/money';

const NUM = String.raw`\d[\d.,]*(?:ribu|rb|jt|juta|k)?`;
const OP = String.raw`[-+−*×x/:÷]`;
const TERM = String.raw`\(*\s*${NUM}\s*\)*`;
// Not inside a word ("abc19k"), then terms joined by operators, then "=".
const SUM = new RegExp(String.raw`(?<![\p{L}\d])(${TERM}(?:\s*${OP}\s*${TERM})*)\s*=`, 'giu');

// Rupiah grouping by hand: the same everywhere (browser, Worker), whatever locale data is there.
const full = (minor: number) => String(minor).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function resolveSums(line: string): string {
  return line.replace(SUM, (whole, sum: string) => {
    const v = evalAmount(sum, 'IDR');
    return v === null ? whole : full(v);
  });
}
