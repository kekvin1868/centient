// Typed amounts: shown with grouping while typing (25.000) and read back as integer minor units. A typed sum
// ("1.500.000*3 + (200.000/4)") is worked out by @centient/money's evalAmount (shared with the log box).
import { DECIMALS, evalAmount, isSum, readAmount } from '@centient/money';

export { evalAmount };

export const showAmount = (minor: number | null, cur: string) => {
  if (minor === null) return '';
  const d = DECIMALS[cur] ?? 0;
  return (minor / 10 ** d).toLocaleString(cur === 'IDR' ? 'id-ID' : 'en-US', {
    maximumFractionDigits: d,
  });
};

/** State for an amount input: the text as typed, and its minor units. A sum keeps its text as typed (`sum`), and
 * `invalid` marks one that can't be worked out. */
export const amountInput = (text: string, cur: string) => {
  if (isSum(text)) {
    const minor = evalAmount(text, cur);
    return { minor, text, sum: true, invalid: minor === null && text.trim() !== '' };
  }
  const minor = readAmount(text, cur);
  return {
    minor,
    text: cur === 'IDR' && minor !== null ? showAmount(minor, cur) : text,
    sum: false,
    invalid: false,
  };
};
