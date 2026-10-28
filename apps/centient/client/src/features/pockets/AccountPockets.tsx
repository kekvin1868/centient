// Under a lifted account card: Move money, then its pockets as a list (tap one for Add money / Back to balance /
// Edit), and the sheets they open. Pockets live inside the account (like Jago's Kantong): its total is the sum of
// its pockets; the Main pocket is the account's free balance and never shows as a pocket.
import { ArrowsLeftRight, ArrowUUpLeft, PencilSimple, Plus } from '@phosphor-icons/react';
import { Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import type { Envelope } from '../../../../src/repos/envelopes';
import { formatMoney } from '../../lib/format';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { AddPocketSheet } from './AddPocketSheet';
import { EditPocketSheet } from './EditPocketSheet';
import { MoveSheet, type Move } from './MoveSheet';
import { PocketRows, type Pocket } from './PocketRows';

type Bal = Account & { balance: number };

export function AccountPockets({ account: a, accounts, pockets }: { account: Bal; accounts: Bal[]; pockets: Pocket[] }) {
  const [move, setMove] = useState<Move | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Envelope | null>(null);
  // The pocket whose actions show; it stays set while the sheet plays its exit.
  const [acting, setActing] = useState<Pocket | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const act = (fn: () => void) => { setActOpen(false); fn(); };
  const main = a.default_envelope_id;
  const rows = pockets.filter(p => p.id !== main);
  return (
    <section className="mt-3" aria-label={`Pockets in ${a.name}`}>
      <Button large rounded tonal onClick={() => setMove({ from: main, to: null })}>
        <ArrowsLeftRight size={18} weight="bold" className="mr-1.5" aria-hidden="true" />Move money
      </Button>
      <div className="mb-3 mt-6 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Pockets</h3>
          <p className="text-[13px] font-semibold text-muted">Inside {a.name}</p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="shrink-0 rounded-full border border-dashed border-current/40 px-3 py-1.5 text-[14px] font-bold active:opacity-70">+ New pocket</button>
      </div>
      <PocketRows pockets={rows} colorIndex={p => pockets.indexOf(p)} onOpen={p => { setActing(p); setActOpen(true); }} />
      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <Sheet open={actOpen} onClose={() => setActOpen(false)} title={acting ? `${acting.name} · ${formatMoney(acting.balance, acting.currency_code)}` : ''}>
        {acting && (
          <Group>
            <Row title="Add money" media={<Plus size={20} weight="bold" />} onClick={() => act(() => setMove({ from: main, to: acting.id }))} />
            <Row title="Back to balance" media={<ArrowUUpLeft size={20} weight="bold" />} onClick={() => act(() => setMove({ from: acting.id, to: main }))} />
            <Row title="Edit" media={<PencilSimple size={20} weight="bold" />} onClick={() => act(() => setEditing(acting))} />
          </Group>
        )}
      </Sheet>
      <MoveSheet key={`move:${move ? `${move.from}:${move.to}` : 'none'}`} preset={move} account={a} pockets={pockets} accounts={accounts} onClose={() => setMove(null)} />
      <AddPocketSheet key={`add-pocket:${adding}`} open={adding} account={a} onClose={() => setAdding(false)} />
      <EditPocketSheet key={`edit-pocket:${editing?.id ?? 'none'}`} pocket={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
