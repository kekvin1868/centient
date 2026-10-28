// Everything that will be saved, before anything is. CONFIRM (or Enter) saves; the sheet stays if saving fails.
import { useState } from 'react';
import { ACCOUNT_KINDS, formatMoney } from '../../../lib/format';
import { NightSheet } from '../../../ui/night/NightSheet';
import { accountBalance, kept, owes, type Draft } from '../model/draft';

type Props = { draft: Draft; links: number; sketches: number; onConfirm: () => Promise<void>; onClose: () => void };

export function ConfirmChanges({ draft, links, sketches, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const go = async () => { if (busy) return; setBusy(true); await onConfirm(); setBusy(false); };
  const unknown = kept(draft).filter(a => accountBalance(a) === null).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <NightSheet label="Confirm changes" title="CONFIRM CHANGES" meta={`${kept(draft).length} KEPT`} place="mid" onClose={onClose}
      onKey={e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}>
      {close => (
        <>
          <div className="c-body">
            {draft.map(a => {
              const b = accountBalance(a);
              const note = [(ACCOUNT_KINDS[a.kind] ?? a.kind).toUpperCase(), plural(a.pockets.length, 'pocket', 'pockets')];
              if (!a.seedName) note.push('NEW');
              else if (a.name !== a.seedName) note.push(`WAS ${a.seedName}`);
              return (
                <div key={a.key} className={`c-row ${a.kept ? '' : 'drop'}`}>
                  <span>{a.name}</span>
                  <span className="money">{!a.kept ? 'DROPPED' : b === null ? <span className="unk">???</span> : `${owes(a.kind) ? 'OWE ' : ''}${formatMoney(b)}`}</span>
                  <small>{note.join(' · ')}</small>
                </div>
              );
            })}
          </div>
          {unknown > 0 && <p className="c-note"><span className="unk">???</span> {plural(unknown, 'account starts', 'accounts start')} at Rp0. Set {unknown > 1 ? 'them' : 'it'} later from Money.</p>}
          {links + sketches > 0 && <p className="c-note">FLOW MAP · {plural(links, 'link', 'links')} · {plural(sketches, 'sketch', 'sketches')} (this device only)</p>}
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={close}>BACK</button>
            <button type="button" className="n-go" disabled={busy} onClick={go}>{busy ? 'SAVING…' : 'CONFIRM ▸'}</button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
