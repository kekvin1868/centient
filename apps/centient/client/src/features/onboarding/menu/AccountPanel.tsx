// The picked account: channel number and type up top, its name typed in fresh on every change (or an input while
// renaming), RENAME / TYPE / DROP, then its pockets. On the "+" row it offers ADD.
import { useEffect, useRef, useState } from 'react';
import { ACCOUNT_KINDS } from '../../../lib/format';
import { RichType } from '../../../ui/night/RichType';
import { NAME_MAX, type AccountDraft } from '../model/draft';
import { PocketList } from './PocketList';

/** Static jolt, a quick scanline redraw, or a glitch. */
const CHANNEL_FX = ['chg', 'chg-render', 'chg-glitch'];

type Props = {
  account: AccountDraft | undefined;
  channel: number;
  renaming: boolean;
  onRename: () => void;
  onRenamed: (name: string | null) => void;
  onType: () => void;
  onToggle: () => void;
  onAdd: () => void;
  onPocket: (pocketKey: string) => void;
  onAddPocket: () => void;
};

export function AccountPanel({ account: a, channel, renaming, onRename, onRenamed, onType, onToggle, onAdd, onPocket, onAddPocket }: Props) {
  const [change, setChange] = useState({ n: 0, cls: '' });
  const first = useRef(true);
  // Channel change: the panel changes like a TV channel, a different way each time.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setChange(c => ({ n: c.n + 1, cls: CHANNEL_FX[Math.floor(Math.random() * CHANNEL_FX.length)] }));
  }, [channel]);
  const kind = a ? (ACCOUNT_KINDS[a.kind] ?? a.kind).toUpperCase() : 'NEW';
  return (
    <div key={change.n} className={`n-panel ${change.cls}`}>
      <div className="n-ph"><span>CH {String(channel).padStart(2, '0')}</span><span key={kind} className="n-val">{kind}</span></div>
      <div className="n-pb">
        {renaming && a ? (
          <input className="n-in" autoFocus defaultValue={a.name} maxLength={NAME_MAX} aria-label="Account name" autoComplete="off"
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') onRenamed(e.currentTarget.value);
              if (e.key === 'Escape') onRenamed(null);
            }}
            onBlur={e => onRenamed(e.target.value)} />
        ) : (
          <RichType key={`${a?.key}:${a?.name}`} text={a ? a.name : '+ NEW'} className="n-name" />
        )}
        <div className="n-acts">
          <button type="button" className="n-btn" onClick={a ? onRename : onAdd}>{a ? 'RENAME' : 'ADD'}</button>
          <button type="button" className="n-btn" disabled={!a?.kept} onClick={onType}>TYPE ▾</button>
          <button type="button" className="n-btn" disabled={!a} onClick={onToggle}>{!a ? '—' : !a.seedName ? 'DELETE' : a.kept ? 'DROP' : 'KEEP'}</button>
        </div>
        <PocketList account={a} onOpen={onPocket} onAdd={onAddPocket} />
      </div>
    </div>
  );
}
