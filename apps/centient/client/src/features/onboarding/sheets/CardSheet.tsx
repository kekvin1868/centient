// A card's or pay later's numbers on one keypad, picked with tabs: its LIMIT, what is still unpaid on its LAST BILL
// and what was spent SINCE that bill (together: what is used). Under it the two bill days on steppers: the day the
// bill closes (spending up to it goes on that month's bill) and the day it must be paid. SET needs the limit and both
// days: without them the card has no bill. Day 31 reads LAST (it lands on each month's last day).
import { useState } from 'react';
import { formatMoney } from '../../../lib/format';
import { Keypad, keypadKey, keypadValue, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { typing } from '../../../ui/night/useLayers';
import { dayWord, type AccountDraft, type CardDraft } from '../model/draft';

type Props = {
  account: AccountDraft;
  onSave: (card: CardDraft) => void;
  onClose: () => void;
};
type Field = 'limit' | 'billed' | 'since';

const TABS: { field: Field; label: string }[] = [
  { field: 'limit', label: 'LIMIT' },
  { field: 'billed', label: 'LAST BILL' },
  { field: 'since', label: 'SINCE' },
];
/** One step along 1-31, wrapping; from ?? it starts on `from`. */
const step = (d: number | null, by: number, from: number) =>
  d === null ? from : ((d - 1 + by + 31) % 31) + 1;
const typed = (n: number | null | undefined) => (n ? String(n) : '');

export function CardSheet({ account, onSave, onClose }: Props) {
  const c = account.card;
  const [on, setOn] = useState<Field>('limit');
  const [digits, setDigits] = useState<Record<Field, string>>({
    limit: typed(c?.limit),
    billed: typed(c?.billed),
    since: typed(c?.since),
  });
  const [closes, setCloses] = useState(c?.closes ?? null);
  const [payBy, setPayBy] = useState(c?.payBy ?? null);
  const [refused, setRefused] = useState(0);
  const value = (f: Field) => (digits[f] ? keypadValue(digits[f]) : null);
  const limit = value('limit') || null;
  const used = (value('billed') ?? 0) + (value('since') ?? 0);

  const press = (k: string) => {
    const next = pressKey(digits[on], k);
    if (next === null) setRefused(r => r + 1);
    else setDigits({ ...digits, [on]: next });
  };
  const set = (close: () => void) => {
    const bad = TABS.find(t => digits[t.field] && value(t.field) === null);
    if (!limit || !closes || !payBy || bad || used > limit) {
      if (bad) setOn(bad.field);
      setRefused(r => r + 1);
      return;
    }
    onSave({ limit, closes, payBy, billed: value('billed'), since: value('since') });
    close();
  };
  const days: [string, number | null, (d: number) => void, number][] = [
    ['CLOSES ON', closes, setCloses, 20],
    ['PAY BY', payBy, setPayBy, 5],
  ];
  const missing = !limit ? 'LIMIT' : !closes || !payBy ? 'BILL DAYS' : null;
  const question = {
    limit: (
      <>
        What's the limit on <em>{account.name}</em>?
      </>
    ),
    billed: (
      <>
        Still unpaid on <em>{account.name}</em>'s last bill?
      </>
    ),
    since: (
      <>
        Spent on <em>{account.name}</em> since that bill?
      </>
    ),
  }[on];

  return (
    <NightSheet
      label={`Limit and bill days of ${account.name}`}
      title={`${account.name} · CARD`}
      onClose={onClose}
      onKey={(e, close) => {
        if (typing(e)) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          set(close);
          return;
        }
        const k = keypadKey(e);
        if (k) {
          e.preventDefault();
          press(k);
        }
      }}
    >
      {close => (
        <>
          <div className="k-body">
            <div className="k-kinds" role="tablist" aria-label="What the keypad sets">
              {TABS.map(t => (
                <button
                  key={t.field}
                  type="button"
                  role="tab"
                  aria-selected={on === t.field}
                  onClick={() => setOn(t.field)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="k-q">{question}</p>
            <Keypad
              digits={digits[on]}
              onPress={press}
              empty={on === 'limit' ? '???' : 'Rp0'}
              refused={refused}
              between={
                <div className="k-days" role="group" aria-label="Bill days">
                  {on !== 'limit' && (
                    <p className={`n-note ${limit && used > limit ? 'k-short' : ''}`}>
                      USED {formatMoney(used)}
                      {limit ? ` OF ${formatMoney(limit)}` : ''}
                      {limit && used > limit ? ' · MORE THAN THE LIMIT' : ''}
                    </p>
                  )}
                  {days.map(([label, day, setDay, from]) => (
                    <div key={label} className="k-day" role="group" aria-label={label}>
                      <span>{label}</span>
                      <button
                        type="button"
                        aria-label={`${label} earlier`}
                        onClick={() => setDay(step(day, -1, from))}
                      >
                        ◂
                      </button>
                      <b className={day === null ? 'unk' : ''} aria-live="polite">
                        {dayWord(day)}
                      </b>
                      <button
                        type="button"
                        aria-label={`${label} later`}
                        onClick={() => setDay(step(day, 1, from))}
                      >
                        ▸
                      </button>
                    </div>
                  ))}
                  <p className="n-note">
                    Both are on your statement: tanggal cetak and jatuh tempo.
                  </p>
                </div>
              }
            />
          </div>
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={close}>
              LATER
            </button>
            <button type="button" className="n-go" onClick={() => set(close)}>
              {missing ? `SET ${missing}` : 'SET ▸'}
            </button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
