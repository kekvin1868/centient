// Everything that will be saved, before anything is. CONFIRM (or Enter) saves; the sheet stays if saving fails.
import { useState } from 'react';
import { ACCOUNT_KINDS, formatMoney } from '../../../lib/format';
import { NightSheet } from '../../../ui/night/NightSheet';
import { accountBalance, kept, owes, type Draft } from '../model/draft';

type Props = {
  draft: Draft;
  links: number;
  sketches: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

export function ConfirmChanges({ draft, links, sketches, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };
  // A card with nothing typed for "already used" simply starts unused: not a ???.
  const unknown = kept(draft).filter(a => accountBalance(a) === null && !owes(a.kind)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <NightSheet
      label="Confirm changes"
      title="CONFIRM CHANGES"
      meta={`${kept(draft).length} KEPT`}
      place="mid"
      onClose={onClose}
      onKey={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      }}
    >
      {close => (
        <>
          <div className="c-body">
            {draft.map(a => {
              const b = accountBalance(a);
              const note = [
                (ACCOUNT_KINDS[a.kind] ?? a.kind).toUpperCase(),
                plural(a.pockets.length, 'pocket', 'pockets'),
              ];
              const card = owes(a.kind) && a.card?.limit ? a.card : null;
              if (card)
                note.push(
                  `CLOSES ${card.closes === 31 ? 'LAST' : card.closes} · PAY BY ${card.payBy === 31 ? 'LAST' : card.payBy}`,
                );
              if (!a.seedName) note.push('NEW');
              else if (a.name !== a.seedName) note.push(`WAS ${a.seedName}`);
              return (
                <div key={a.key} className={`c-row ${a.kept ? '' : 'drop'}`}>
                  <span>{a.name}</span>
                  <span className="money">
                    {!a.kept ? (
                      'DROPPED'
                    ) : card ? (
                      // A card shows what is left of its limit, as everywhere else in the app.
                      `LEFT ${formatMoney(card.limit! - (b ?? 0))}`
                    ) : b === null ? (
                      <span className="unk">???</span>
                    ) : (
                      formatMoney(b)
                    )}
                  </span>
                  <small>{note.join(' · ')}</small>
                </div>
              );
            })}
          </div>
          {unknown > 0 && (
            <p className="c-note">
              <span className="unk">???</span> {plural(unknown, 'account starts', 'accounts start')}{' '}
              at Rp0. Set {unknown > 1 ? 'them' : 'it'} later from Money.
            </p>
          )}
          {links + sketches > 0 && (
            <p className="c-note">
              FLOW MAP · {plural(links, 'link', 'links')} · {plural(sketches, 'sketch', 'sketches')}{' '}
              (this device only)
            </p>
          )}
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={close}>
              BACK
            </button>
            <button type="button" className="n-go" disabled={busy} onClick={go}>
              {busy ? 'SAVING…' : 'CONFIRM ▸'}
            </button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
