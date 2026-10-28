// Every account type at once, each with a line on what it's for. Glitches in and out.
import { useState } from 'react';
import { ACCOUNT_KINDS } from '../../../lib/format';
import { NightList } from '../../../ui/night/NightList';
import { NightSheet } from '../../../ui/night/NightSheet';
import { KIND_NOTES } from '../model/copy';
import { SETUP_KINDS, type AccountDraft } from '../model/draft';

export function TypePicker({ account, onPick, onClose }: { account: AccountDraft; onPick: (kind: string) => void; onClose: () => void }) {
  const n = SETUP_KINDS.length;
  const [at, setAt] = useState(Math.max(0, SETUP_KINDS.indexOf(account.kind)));
  const pick = (i: number, close: () => void) => { onPick(SETUP_KINDS[i]); close(); };
  return (
    <NightSheet label={`Type of ${account.name}`} title={`TYPE · ${account.name}`} meta={n} place="mid" fx="glitch" onClose={onClose}
      onKey={(e, close) => {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); setAt((at + 1) % n); }
        else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); setAt((at + n - 1) % n); }
        else if (/^[1-7]$/.test(k)) pick(+k - 1, close);
        else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(at, close); }
      }}>
      {close => (
        <NightList label="Account types" className="t-list" selected={at}
          rows={SETUP_KINDS.map((k, i) => ({
            key: k, label: (ACCOUNT_KINDS[k] ?? k).toUpperCase(), note: KIND_NOTES[k], mark: k === account.kind ? 'on' : undefined,
            bind: { onClick: () => pick(i, close), onPointerEnter: () => setAt(i) },
          }))} />
      )}
    </NightSheet>
  );
}
