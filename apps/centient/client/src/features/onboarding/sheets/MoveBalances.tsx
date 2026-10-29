// MOVE BALANCES: takes some of an account's balance (its Main pocket) to another account's balance or one of its
// pockets. Opening balances only, so it just changes the draft (one undo step). Cards and pay later aren't offered:
// their numbers are what's owed, not money held. More than the balance holds shakes the keypad. ↑ ↓ pick the target.
import { useState } from 'react';
import { formatMoney } from '../../../lib/format';
import { Keypad, keypadKey, keypadValue, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { owes, type AccountDraft, type Draft } from '../model/draft';

type Target = { account: string; pocket: string };

export function MoveBalances({ draft, account, onMove, onClose }: {
  draft: Draft; account: AccountDraft; onMove: (to: Target, amount: number) => void; onClose: () => void;
}) {
  const have = account.pockets.find(p => p.main)?.balance ?? 0;
  const targets = draft.filter(a => a.kept && a.key !== account.key && !owes(a.kind))
    .flatMap(a => a.pockets.map(p => ({ account: a.key, pocket: p.key, label: p.main ? a.name : `${a.name} · ${p.name}`, main: p.main, balance: p.balance })));
  const [to, setTo] = useState<Target | null>(targets[0] ?? null);
  const [digits, setDigits] = useState('');
  const [refused, setRefused] = useState(0);
  const press = (k: string) => { const next = pressKey(digits, k); if (next === null) setRefused(r => r + 1); else setDigits(next); };
  const go = async (close: () => Promise<void>) => {
    const v = keypadValue(digits);
    if (!to || !v || v > have) { setRefused(r => r + 1); return; }
    await close();
    onMove(to, v);
  };
  return (
    <NightSheet label={`Move balances from ${account.name}`} title="MOVE BALANCES" meta={formatMoney(have)} onClose={onClose}
      onKey={(e, close) => {
        if (e.key === 'Enter') { e.preventDefault(); go(close); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const i = targets.findIndex(t => t.pocket === to?.pocket), n = targets.length;
          const t = targets[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n];
          if (t) setTo({ account: t.account, pocket: t.pocket });
          return;
        }
        const k = keypadKey(e);
        if (k) { e.preventDefault(); press(k); }
      }}>
      {close => (
        <>
          <p className="k-q">Move from <em>{account.name}</em> to</p>
          {targets.length ? (
            <div className="n-pockets k-to" role="radiogroup" aria-label="Move to">
              {targets.map(t => (
                <button key={t.pocket} type="button" role="radio" className="n-pk" aria-checked={to?.pocket === t.pocket}
                  onClick={() => setTo({ account: t.account, pocket: t.pocket })}>
                  <span>{t.label}</span>
                  <small>{t.main ? 'BALANCE' : ''}</small>
                  <span className="money">{t.balance === null ? <span className="unk">???</span> : formatMoney(t.balance)}</span>
                </button>
              ))}
            </div>
          ) : <p className="n-note k-to">No other account can take it. Cards and pay later hold what you owe.</p>}
          <Keypad digits={digits} onPress={press} empty="0" refused={refused} />
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={close}>CANCEL</button>
            <button type="button" className="n-go" disabled={!targets.length} onClick={() => go(close)}>MOVE ▸</button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
