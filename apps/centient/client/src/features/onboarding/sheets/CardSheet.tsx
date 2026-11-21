// A card's or pay later's limit on the keypad, then the two bill days on steppers: the day the bill closes (spending
// up to it goes on that month's bill) and the day it must be paid. SET needs all three: without them the card has
// no bill. Day 31 reads LAST (it lands on each month's last day).
import { useState } from 'react';
import { Keypad, keypadKey, keypadValue, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { typing } from '../../../ui/night/useLayers';
import type { AccountDraft, CardDraft } from '../model/draft';

type Props = {
  account: AccountDraft;
  onSave: (card: CardDraft) => void;
  onClose: () => void;
};

const dayText = (d: number | null) => (d === null ? '??' : d === 31 ? 'LAST' : String(d));
/** One step along 1-31, wrapping; from ?? it starts on `from`. */
const step = (d: number | null, by: number, from: number) =>
  d === null ? from : ((d - 1 + by + 31) % 31) + 1;

export function CardSheet({ account, onSave, onClose }: Props) {
  const [digits, setDigits] = useState(account.card?.limit ? String(account.card.limit) : '');
  const [closes, setCloses] = useState(account.card?.closes ?? null);
  const [payBy, setPayBy] = useState(account.card?.payBy ?? null);
  const [refused, setRefused] = useState(0);
  const v = keypadValue(digits);
  const limit = digits && v ? v : null;

  const press = (k: string) => {
    const next = pressKey(digits, k);
    if (next === null) setRefused(r => r + 1);
    else setDigits(next);
  };
  const set = (close: () => void) => {
    if (!limit || !closes || !payBy) {
      setRefused(r => r + 1);
      return;
    }
    onSave({ limit, closes, payBy });
    close();
  };
  const days: [string, number | null, (d: number) => void, number][] = [
    ['CLOSES ON', closes, setCloses, 20],
    ['PAY BY', payBy, setPayBy, 5],
  ];
  const missing = !limit ? 'LIMIT' : !closes || !payBy ? 'BILL DAYS' : null;

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
            <p className="k-q">
              What's the limit on <em>{account.name}</em>?
            </p>
            <Keypad
              digits={digits}
              onPress={press}
              empty="???"
              refused={refused}
              between={
                <div className="k-days" role="group" aria-label="Bill days">
                  {days.map(([label, day, setDay, from]) => (
                    <div key={label} className="k-day">
                      <span>{label}</span>
                      <button
                        type="button"
                        aria-label={`${label} earlier`}
                        onClick={() => setDay(step(day, -1, from))}
                      >
                        ◂
                      </button>
                      <b className={day === null ? 'unk' : ''} aria-live="polite">
                        {dayText(day)}
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
