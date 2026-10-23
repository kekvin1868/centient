// The pockets section under a lifted account card: the deck, one toolbar for the front pocket, and the sheets
// it opens. Pockets live inside the account (like Jago's Kantong): its balance is the sum of its pockets.
import { ArrowsLeftRight, ArrowUUpLeft, PencilSimple, Plus } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import type { Envelope } from '../../../../src/repos/envelopes';
import { AddPocketSheet } from './AddPocketSheet';
import { EditPocketSheet } from './EditPocketSheet';
import { MoveSheet, type Move } from './MoveSheet';
import { PocketDeck, type Pocket } from './PocketDeck';

export function AccountPockets({ account: a, pockets }: { account: Account; pockets: Pocket[] }) {
  const [move, setMove] = useState<Move | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Envelope | null>(null);
  const [frontId, setFrontId] = useState<string | null>(a.default_envelope_id);
  const shown = pockets.filter(p => !p.archived_at);
  const front = shown.find(p => p.id === frontId) ?? shown[0];
  const main = a.default_envelope_id;
  return (
    <section className="mt-6" aria-label={`Pockets in ${a.name}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Pockets</h3>
          <p className="text-[13px] font-semibold text-muted">Inside {a.name}</p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="shrink-0 rounded-full border border-dashed border-current/40 px-3 py-1.5 text-[14px] font-bold active:opacity-70">+ New pocket</button>
      </div>
      <PocketDeck pockets={shown} mainId={main} front={front?.id ?? null} onFront={setFrontId} />
      {front && (
        <div className="panel mt-5 flex gap-1.5 rounded-[20px] bg-raised p-1.5" role="toolbar" aria-label={`${front.name} actions`}>
          {front.id === main
            ? <Tool icon={<ArrowsLeftRight size={18} weight="bold" />} onClick={() => setMove({ accountId: a.id, from: main, to: null })}>Move to a pocket</Tool>
            : <>
                <Tool icon={<Plus size={18} weight="bold" />} onClick={() => setMove({ accountId: a.id, from: main, to: front.id })}>Add money</Tool>
                <Tool icon={<ArrowUUpLeft size={18} weight="bold" />} onClick={() => setMove({ accountId: a.id, from: front.id, to: main })}>Back to Main</Tool>
              </>}
          <button type="button" onClick={() => setEditing(front)} aria-label={`Edit ${front.name}`}
            className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-white shadow-[0_2px_0_var(--lip)] active:opacity-70 dark:bg-raised-2">
            <PencilSimple size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <MoveSheet key={`move:${move ? `${move.from}:${move.to}` : 'none'}`} preset={move} pockets={shown} onClose={() => setMove(null)} />
      <AddPocketSheet key={`add-pocket:${adding}`} open={adding} account={a} onClose={() => setAdding(false)} />
      <EditPocketSheet key={`edit-pocket:${editing?.id ?? 'none'}`} pocket={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function Tool({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-white text-[15px] font-bold shadow-[0_2px_0_var(--lip)] active:opacity-70 dark:bg-raised-2">
      <span aria-hidden="true">{icon}</span><span className="truncate">{children}</span>
    </button>
  );
}
