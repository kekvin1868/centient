// The pockets section under a lifted account card: its stack, + Add pocket, Move between, and the sheets
// they open. Pockets live inside the account (like Jago's Kantong): its balance is the sum of its pockets.
import { useState } from 'react';
import type { Account, Envelope } from '../../../../src/application/ports';
import { AddPocketSheet } from './AddPocketSheet';
import { EditPocketSheet } from './EditPocketSheet';
import { MoveSheet, type Move } from './MoveSheet';
import { PocketStack, type Pocket } from './PocketStack';

export function AccountPockets({ account: a, pockets }: { account: Account; pockets: Pocket[] }) {
  const [move, setMove] = useState<Move | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Envelope | null>(null);
  const shown = pockets.filter(p => !p.archived_at);
  const button = 'panel flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80';
  return (
    <section className="mt-6" aria-label={`Pockets in ${a.name}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Pockets</h3>
        <span className="text-[13px] font-semibold text-muted">Inside {a.name}</span>
      </div>
      <div className="-mx-4">
        <PocketStack pockets={shown} mainId={a.default_envelope_id}
          onAdd={id => setMove({ accountId: a.id, from: a.default_envelope_id, to: id })}
          onMoveOut={id => setMove({ accountId: a.id, from: id, to: id === a.default_envelope_id ? null : a.default_envelope_id })}
          onEdit={setEditing} />
      </div>
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => setAdding(true)} className={button}>+ Add pocket</button>
        {pockets.length > 1 && <button type="button" onClick={() => setMove({ accountId: a.id, from: null, to: null })} className={button}>Move between</button>}
      </div>
      <p className="mt-2 text-[13px] text-muted">New money lands in Main. Pockets set some of {a.name}'s money aside; its balance stays the same.</p>
      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <MoveSheet key={`move:${move ? `${move.from}:${move.to}` : 'none'}`} preset={move} pockets={shown} onClose={() => setMove(null)} />
      <AddPocketSheet key={`add-pocket:${adding}`} open={adding} account={a} onClose={() => setAdding(false)} />
      <EditPocketSheet key={`edit-pocket:${editing?.id ?? 'none'}`} pocket={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
