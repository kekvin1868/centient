// The night menu: every account, pocket and starting balance set in one place (NieR:Automata's layout, VA-11
// Hall-A's lighting). Rows: tap picks, tap again renames, hold opens the type picker, swipe left drops, right
// keeps. Every change can be undone. It opens the sheets and the flow board; keys go to whichever is on top.
import { FlowArrow } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatMoney } from '../../../lib/format';
import { showToast } from '../../../ui/Toast';
import { IdleHint } from '../../../ui/night/IdleHint';
import { NightList, type NightRow } from '../../../ui/night/NightList';
import { gestureProps } from '../../../ui/night/useGesture';
import { typing, useLayerKeys } from '../../../ui/night/useLayers';
import { FlowBoard } from '../board/FlowBoard';
import type { Board } from '../board/state';
import { HINTS } from '../model/copy';
import { accountBalance, addAccount, addPocket, editPocket, kept, MAX_ACCOUNTS, moveBalance, owes, removePocket, rename, setKind, toggle, type Draft } from '../model/draft';
import { ConfirmChanges } from '../sheets/ConfirmChanges';
import { GuideSheet } from '../sheets/GuideSheet';
import { MoveBalances } from '../sheets/MoveBalances';
import { PocketSheet } from '../sheets/PocketSheet';
import { TypePicker } from '../sheets/TypePicker';
import { AccountPanel } from './AccountPanel';

type Props = {
  draft: Draft; setDraft: (d: Draft) => void; undo: () => boolean;
  board: Board; setBoard: (b: Board) => void; undoBoard: () => boolean;
  onSave: () => Promise<void>;
  closing: boolean;
};
type Open = { kind: 'type' } | { kind: 'pocket'; key: string } | { kind: 'move' } | { kind: 'confirm' } | { kind: 'guide' } | { kind: 'board' } | null;

export function NightMenu({ draft, setDraft, undo, board, setBoard, undoBoard, onSave, closing }: Props) {
  const [sel, setSel] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const rows = draft.length + (draft.length < MAX_ACCOUNTS ? 1 : 0);
  const a = draft[sel] as Draft[number] | undefined;
  const pocket = open?.kind === 'pocket' ? a?.pockets.find(p => p.key === open.key) : undefined;

  const change = (d: Draft, msg?: string) => {
    setDraft(d);
    if (msg) showToast(msg, { action: { label: 'UNDO', run: doUndo } });
  };
  const doUndo = () => { if (!undo()) showToast('NOTHING TO UNDO'); };
  const pick = (i: number) => { setSel(i); setRenaming(false); };
  const startRename = () => { if (a) setRenaming(true); else add(); };
  const renamed = (name: string | null) => {
    if (!renaming) return;
    setRenaming(false);
    if (a && name !== null && name.trim() && name.trim() !== a.name) change(rename(draft, a.key, name));
  };
  const add = () => {
    const r = addAccount(draft);
    if (!r) return;
    change(r.draft);
    setSel(r.draft.length - 1);
    setRenaming(true);
  };
  const drop = () => {
    if (!a) return;
    const next = toggle(draft, a.key);
    change(next, `${a.name} ${!a.seedName ? 'DELETED' : a.kept ? 'DROPPED' : 'KEPT'}`);
    setSel(Math.min(sel, next.length));
  };
  const type = () => { if (a?.kept) setOpen({ kind: 'type' }); };
  const newPocket = () => {
    if (!a?.kept) return;
    const r = addPocket(draft, a.key);
    change(r.draft);
    setOpen({ kind: 'pocket', key: r.key });
  };
  // 0 is the balance (Main, always first); 1-9 the pockets under it.
  const openPocket = (i: number) => { const p = a?.kept && a.pockets[i]; if (p) setOpen({ kind: 'pocket', key: p.key }); };
  const confirm = () => { if (kept(draft).length) setOpen({ kind: 'confirm' }); };

  useLayerKeys(e => {
    if (renaming || typing(e)) return;
    const k = e.key, mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (mod && k === 'Enter') { e.preventDefault(); confirm(); return; }
    if (mod || e.altKey) return;
    // Enter or Space on a focused button outside the list presses that button.
    if ((k === 'Enter' || k === ' ') && (e.target as Element).closest?.('button') && !(e.target as Element).closest('.n-list')) return;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); pick((sel + 1) % rows); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); pick((sel + rows - 1) % rows); }
    else if (k === 'Enter' || k === 'r' || k === 'F2') { e.preventDefault(); startRename(); }
    else if (k === 'n') add();
    else if (k === 't') type();
    else if (k === 'd' || k === 'Delete' || k === 'Backspace') { e.preventDefault(); drop(); }
    else if (k === 'p') newPocket();
    else if (/^[0-9]$/.test(k)) openPocket(+k);
    else if (k === 'c') setOpen({ kind: 'board' });
    else if (k === '?') setOpen({ kind: 'guide' });
  }, !open && !closing);

  const list: NightRow[] = draft.map((x, i) => {
    const b = accountBalance(x);
    return {
      key: x.key, label: x.name, mark: x.kept ? 'on' : 'off', sig: `${x.name}|${x.kept}|${b}`,
      side: !x.kept ? 'DROPPED' : b === null ? <span className="unk">???</span> : <span className="money">{formatMoney(b)}</span>,
      bind: gestureProps({
        onTap: () => (i === sel ? startRename() : pick(i)),
        onHold: () => { pick(i); if (x.kept) setOpen({ kind: 'type' }); },
        onSwipe: dir => { if ((dir === 'left') === x.kept) { setSel(i); change(toggle(draft, x.key), `${x.name} ${!x.seedName ? 'DELETED' : x.kept ? 'DROPPED' : 'KEPT'}`); } },
      }),
    };
  });
  if (draft.length < MAX_ACCOUNTS) list.push({ key: 'add', label: 'ADD ACCOUNT', mark: 'add', bind: { onClick: () => (sel === draft.length ? add() : pick(draft.length)) } });

  const hint = open?.kind === 'guide' ? null : (open?.kind ?? 'menu') as keyof typeof HINTS;
  return (
    <div className={`scene nier ${closing ? 'n-close' : ''}`}>
      <div className="n-roll" aria-hidden="true" />
      <div className="n-head">
        <h1 className="n-title">ACCOUNTS</h1>
        <span className="n-meta">
          <span className="n-count">{kept(draft).length} KEPT · {draft.length}/{MAX_ACCOUNTS}</span>
          <button type="button" className="n-help" aria-label="Guide and controls" onClick={() => setOpen({ kind: 'guide' })}>?</button>
        </span>
      </div>
      <div className="n-staff" />
      <NightList label="Accounts" className="intro" rows={list} selected={sel} />
      <AccountPanel account={a} channel={sel + 1} renaming={renaming} onRename={startRename} onRenamed={renamed}
        onType={type} onToggle={drop} onAdd={add} onAddPocket={newPocket} onPocket={key => setOpen({ kind: 'pocket', key })} />
      <div className="n-foot">
        <button type="button" className="n-go wide" disabled={!kept(draft).length} onClick={confirm}>CONFIRM ▸</button>
        <button type="button" className="n-fab" aria-label="Flow board" onClick={() => setOpen({ kind: 'board' })}><FlowArrow weight="bold" /></button>
      </div>

      {open?.kind === 'type' && a && <TypePicker account={a} onClose={() => setOpen(null)}
        onPick={kind => { if (kind !== a.kind) change(setKind(draft, a.key, kind)); }} />}
      {pocket && a && <PocketSheet key={pocket.key} account={a} pocket={pocket} onClose={() => setOpen(null)}
        onSave={patch => change(editPocket(draft, a.key, pocket.key, patch))}
        onDelete={() => change(removePocket(draft, a.key, pocket.key), `${pocket.name} DELETED`)}
        onMove={pocket.main && !owes(a.kind) ? () => setOpen({ kind: 'move' }) : undefined} />}
      {open?.kind === 'move' && a && <MoveBalances draft={draft} account={a} onClose={() => setOpen(null)}
        onMove={(to, amount) => change(moveBalance(draft, a.key, to.account, to.pocket, amount), `MOVED ${formatMoney(amount)} TO ${draft.find(x => x.key === to.account)?.name}`)} />}
      {open?.kind === 'confirm' && <ConfirmChanges draft={draft} links={board.links.length} sketches={board.strokes.length} onConfirm={onSave} onClose={() => setOpen(null)} />}
      {open?.kind === 'guide' && <GuideSheet onClose={() => setOpen(null)} />}
      {open?.kind === 'board' && <FlowBoard draft={draft} board={board} setBoard={setBoard} undo={undoBoard} onClose={() => setOpen(null)} />}
      {hint && !closing && <IdleHint key={hint} id={hint} text={HINTS[hint]} top={hint !== 'menu'} />}
    </div>
  );
}
