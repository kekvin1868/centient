// One pocket's balance on Cash App's keypad, plus its name and kind when it isn't Main. SET switches the sheet off
// like a TV; LEAVE ??? keeps the balance unknown.
import { useState } from 'react';
import { POCKET_KINDS } from '../../../lib/format';
import { Keypad, keypadKey, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { typing } from '../../../ui/night/useLayers';
import { NAME_MAX, owes, type AccountDraft, type PocketDraft, type PocketKind } from '../model/draft';

type Props = {
  account: AccountDraft;
  pocket: PocketDraft;
  onSave: (patch: { name?: string; kind?: PocketKind; balance: number | null }) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function PocketSheet({ account, pocket, onSave, onDelete, onClose }: Props) {
  const [digits, setDigits] = useState(pocket.balance === null ? '' : String(pocket.balance));
  const [name, setName] = useState(pocket.name);
  const [kind, setKind] = useState<PocketKind>(pocket.kind);
  const [refused, setRefused] = useState(0);
  const at = account.pockets.indexOf(pocket) + 1;
  const press = (k: string) => { const next = pressKey(digits, k); if (next === null) setRefused(r => r + 1); else setDigits(next); };
  const save = (balance: number | null, close: () => void) => {
    onSave(pocket.main ? { balance } : { name, kind, balance });
    close();
  };
  const question = owes(account.kind) ? <>What do you owe on <em>{account.name}</em>?</>
    : pocket.main ? <>What's in <em>{account.name}</em>?</> : <>How much is in this pocket?</>;
  return (
    <NightSheet label={`${pocket.name} in ${account.name}`} title={`${account.name} · POCKET ${at}/${account.pockets.length}`} meta={pocket.main ? 'MAIN' : 'POCKET'}
      onClose={onClose}
      onKey={(e, close) => {
        if (typing(e)) { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } return; }
        if (e.key === 'Enter') { e.preventDefault(); save(digits ? Number(digits) : 0, close); return; }
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
            <button type="button" className="n-go" onClick={() => save(digits ? Number(digits) : 0, close)}>SET ▸</button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
