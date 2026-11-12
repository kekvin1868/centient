// How to type a line in the log box: every rule the quick add parser reads, with examples it is tested on. The word
// lists come from @centient/quickadd's dictionary, so the guide stays true when a word is added. Opened by the `?`
// keycap; same look as the Insights Glossary.
import { CURRENCY_WORDS } from '@centient/money';
import {
  CASH_WORDS,
  DAY_NAMES,
  HOKKIEN_AMBIGUOUS,
  HOKKIEN_EXACT,
  HOKKIEN_UNITS,
  INCOME_WORDS,
  PROVIDER_ALIASES,
  SUFFIXES,
  TRANSFER_WORDS,
} from '@centient/quickadd';
import { formatMoney } from '../../lib/format';
import { catalog, qctx } from '../../lib/state';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

const list = (words: Iterable<string>) => [...words].join(', ');
const rp = (n: number) => formatMoney(n, 'IDR');
// Full day names only: the short ones (sen, sel…) are the same words cut down.
const days = Object.keys(DAY_NAMES).filter(d => d.length > 3);
const units = [...SUFFIXES].filter(s => !(s in CURRENCY_WORDS));

export const RULES: [rule: string, examples: string, words?: string][] = [
  ['Amounts', 'kopi 25rb · grab 18k · gaji 9,5jt · laptop 2m', `Units: ${list(units)}`],
  [
    'A bare number',
    'parkir 2 → Rp2.000',
    'Sized by what it is; when several sizes fit, the card asks',
  ],
  [
    'Several at once',
    'kopi 25rb, grab 18k',
    'Split by a comma, ;, dan, and, & or +. A part without an amount (makan 30rb dan es teh) is a note',
  ],
  [
    'Which account',
    'netflix 186rb bca · angpao 200rb cash',
    `Your account names, or: ${list(Object.keys(PROVIDER_ALIASES))}, ${list(CASH_WORDS)}`,
  ],
  ['Money in', 'gaji 9,5jt · dapat angpao 200rb', list(INCOME_WORDS)],
  [
    'Moving and lending',
    'transfer 500rb dari BCA ke GoPay · pinjemin ke friends 1jt · top up gopay 100rb admin 1000',
    list(TRANSFER_WORDS),
  ],
  ['Split a bill', 'makan 300rb bagi 3', 'bagi, bg or split, then how many people'],
  [
    'Sums',
    'kopi 25rb+18rb= → kopi 43.000 · dimsum 19k/3= → dimsum 6.333',
    '= works it out as you type; Undo, backspace or Cmd/Ctrl+Z brings the sum back. To split a bill, use bagi',
  ],
  [
    'Another day',
    'kmrn bensin 100rb · senin makan 30rb · tgl 20 makan 30rb',
    `kemarin, kemarin lusa, ${list(days)}`,
  ],
  [
    'Hokkien',
    'parkir goceng · ojek ceban',
    [
      ...Object.entries(HOKKIEN_EXACT).map(([w, n]) => `${w} = ${rp(n)}`),
      ...Object.entries(HOKKIEN_AMBIGUOUS).map(([w, ns]) => `${w} = ${ns.map(rp).join(' or ')}`),
      ...Object.entries(HOKKIEN_UNITS).map(([w, n]) => `${w} = ×${rp(n).replace('Rp', '')}`),
    ].join(' · '),
  ],
  ['Other currencies', 'lunch 20 usd bca · lunch $20.5 wise', list(Object.keys(CURRENCY_WORDS))],
];

export function LogGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const learned = (qctx.value?.aliases ?? []).filter(a => a.kind !== 'CATEGORY');
  return (
    <Sheet open={open} onClose={onClose} title="How to log">
      <Group foot="Type it like a text. Anything the line doesn't say, the card asks.">
        {RULES.map(([rule, examples, words]) => (
          <Row
            key={`rule:${rule}`}
            title={rule}
            sub={
              <>
                <span className="block text-ink">{examples}</span>
                {words && <span className="block">{words}</span>}
              </>
            }
          />
        ))}
      </Group>
      {learned.length > 0 && (
        <Group label="Words it learned from you">
          {learned.map(a => (
            <Row
              key={`alias:${a.kind}:${a.alias}`}
              title={a.alias}
              sub={`→ ${a.kind === 'MERCHANT' ? a.value : (catalog.value?.accounts.find(x => x.id === a.value)?.name ?? 'an account')}`}
            />
          ))}
        </Group>
      )}
    </Sheet>
  );
}
