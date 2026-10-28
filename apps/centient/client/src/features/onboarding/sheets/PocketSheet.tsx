// One pocket's balance on Cash App's keypad, plus its name and kind when it isn't Main. Main is shown as the
// account's BALANCE (never named) and offers MOVE BALANCES in the title bar. SET switches the sheet off like a TV;
// LEAVE ??? keeps the balance unknown. A sum typed on the keyboard is worked out; one that can't be is refused.
import { useState } from 'react';
import { POCKET_KINDS } from '../../../lib/format';
import { Keypad, keypadKey, keypadValue, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { typing } from '../../../ui/night/useLayers';
import { NAME_MAX, owes, type AccountDraft, type PocketDraft, type PocketKind } from '../model/draft';

type Props = {
  account: AccountDraft;
  pocket: PocketDraft;
  onSave: (patch: { name?: string; kind?: PocketKind; balance: number | null }) => void;
  onDelete: () => void;
  /** Main only: saves what was typed, then opens MOVE BALANCES. */
  onMove?: () => void;
  onClose: () => void;
};

export function PocketSheet({ account, pocket, onSave, onDelete, onMove, onClose }: Props) {
  const [digits, setDigits] = useState(pocket.balance === null ? '' : String(pocket.balance));
  const [name, setName] = useState(pocket.name);
  const [kind, setKind] = useState<PocketKind>(pocket.kind);
  const [refused, setRefused] = useState(0);
  const at = account.pockets.indexOf(pocket);
  const press = (k: string) => { const next = pressKey(digits, k); if (next === null) setRefused(r => r + 1); else setDigits(next); };
  const save = (balance: number | null, close: () => void) => {
    onSave(pocket.main ? { balance } : { name, kind, balance });
    close();
  };
  /** SET: what was typed, or a shake when it is a sum that can't be worked out. */
  const set = (close: () => void) => {
    const v = keypadValue(digits);
    if (v === null) setRefused(r => r + 1);
    else save(v, close);
  };
  const v = keypadValue(digits);
  const move = async (close: () => Promise<void>) => {
    if (!onMove || !v) return;
    onSave({ balance: v });
    await close();
    onMove();
  };
  const question = owes(account.kind) ? <>What do you owe on <em>{account.name}</em>?</>
    : pocket.main ? <>What's in <em>{account.name}</em>?</> : <>How much is in this pocket?</>;
  return (
    <NightSheet label={pocket.main ? `Balance in ${account.name}` : `${pocket.name} in ${account.name}`}
      title={pocket.main ? `${account.name} · BALANCE` : `${account.name} · POCKET ${at}/${account.pockets.length - 1}`}
      meta={!pocket.main ? 'POCKET' : !onMove ? '' : close => (
        <button type="button" className="n-win" disabled={!v} onClick={() => move(close)}>MOVE BALANCES</button>
      )}
      onClose={onClose}
      onKey={(e, close) => {
        if (typing(e)) { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } return; }
        if (e.key === 'Enter') { e.preventDefault(); set(close); return; }
        if (e.key === '?') { save(null, close); return; }
        const k = keypadKey(e);
        if (k) { e.preventDefault(); press(k); }
      }}>
      {close => (
        <>
          {!pocket.main && <div className="k-top"><button type="button" className="del" onClick={async () => { await close(); onDelete(); }}>DELETE</button></div>}
          <p className="k-q">{question}</p>
          {!pocket.main && (
            <>
              <div className="k-name"><input value={name} maxLength={NAME_MAX} aria-label="Pocket name" autoComplete="off" onChange={e => setName(e.target.value)} /></div>
              <div className="k-kinds">
                {(['SPENDING', 'SAVINGS'] as const).map(k => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{POCKET_KINDS[k].toUpperCase()}</button>
                ))}
              </div>
            </>
          )}
          <Keypad digits={digits} onPress={press} empty="???" refused={refused} />
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={() => save(null, close)}>LEAVE ???</button>
            <button type="button" className="n-go" onClick={() => set(close)}>SET ▸</button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
