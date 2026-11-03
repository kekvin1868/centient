// First open (and after a reset): a title screen, a VA-11 Hall-A style date card, then the night menu where the
// seeded accounts are kept, dropped, renamed and filled in, with pockets and starting balances. Nothing is saved
// until CONFIRM; then the draft becomes API calls and Home takes over. Shown while the workspace isn't onboarded.
import { useEffect, useRef, useState } from 'react';
import { useHistory } from '../lib/history';
import { catalog, me } from '../lib/state';
import { accountApi, toAccountKind } from '../models/account';
import { entryApi } from '../models/entry';
import { pocketApi, toPocketKind } from '../models/pocket';
import { persist, queryClient } from '../models/query';
import { workspaceApi } from '../models/workspace';
import { save } from '../lib/storage';
import { emptyBoard, type Board } from '../features/onboarding/board/state';
import { DateCard } from '../features/onboarding/intro/DateCard';
import { TitleScreen } from '../features/onboarding/intro/TitleScreen';
import { NightMenu } from '../features/onboarding/menu/NightMenu';
import { toSteps, type Step } from '../features/onboarding/model/commands';
import { fromCatalog, type Draft } from '../features/onboarding/model/draft';
import { resetHints } from '../ui/night/IdleHint';
import { NightRoot } from '../ui/night/NightRoot';
import { wait } from '../ui/night/tv';

type Phase = 'title' | 'date' | 'boot' | 'menu';

export function FirstRun({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('title');
  const [draft, setDraft, undo] = useHistory<Draft>(() =>
    fromCatalog(catalog.value.accounts, catalog.value.envelopes),
  );
  const [board, setBoard, undoBoard] = useHistory<Board>(emptyBoard);
  const [closing, setClosing] = useState(false);
  // Server ids of what this run created (by draft key), and the steps already done, so a retry picks up where it failed.
  const ids = useRef(new Map<string, string>());
  const done = useRef(new Set<string>());

  useEffect(() => resetHints(), []);
  // The TV boots between the date card and the menu.
  useEffect(() => {
    if (phase !== 'boot') return;
    const t = setTimeout(() => setPhase('menu'), 420);
    return () => clearTimeout(t);
  }, [phase]);

  const accountId = (key: string) => draft.find(a => a.key === key)?.id ?? ids.current.get(key)!;
  const pocketId = (key: string) =>
    draft.flatMap(a => a.pockets).find(p => p.key === key)?.id ?? ids.current.get(key)!;
  const mainOf = (key: string) =>
    pocketId(draft.find(a => a.key === key)!.pockets.find(p => p.main)!.key);

  const run = async (s: Step) => {
    switch (s.op) {
      case 'deleteAccount':
        return accountApi.remove(s.accountId);
      case 'patchAccount':
        return accountApi.update(s.accountId, {
          ...s.json,
          kind: s.json.kind === undefined ? undefined : toAccountKind(s.json.kind),
        });
      case 'createAccount': {
        const a = await accountApi.create({ name: s.name, kind: toAccountKind(s.kind) });
        ids.current.set(s.accountKey, a.id);
        const main = draft.find(x => x.key === s.accountKey)!.pockets.find(p => p.main)!;
        ids.current.set(main.key, a.default_envelope_id!);
        return;
      }
      case 'patchPocket':
        return pocketApi.update(s.pocketId, { name: s.name });
      case 'createPocket': {
        const p = await pocketApi.create({
          accountId: accountId(s.accountKey),
          name: s.name,
          kind: toPocketKind(s.kind),
        });
        ids.current.set(s.pocketKey, p.id);
        return;
      }
      case 'setBalance':
        return accountApi.checkBalance(accountId(s.accountKey), { actual: s.actual });
      case 'allocate':
        return entryApi.record({
          commands: s.moves.map(m => ({
            type: 'ALLOCATE' as const,
            fromEnvelopeId: mainOf(m.accountKey),
            toEnvelopeId: pocketId(m.pocketKey),
            amount: m.amount,
            date: me.value!.today,
          })),
        });
      case 'finish':
        return workspaceApi.update({ onboarded: true });
    }
  };

  const confirm = async () => {
    // The steps resume where a failure stopped them. Nothing refreshes until the closing animation has played:
    // the refreshed workspace is onboarded, which swaps this screen for Home.
    const ok = await persist(async () => {
      for (const s of toSteps(draft)) {
        if (done.current.has(s.id)) continue;
        await run(s);
        done.current.add(s.id);
      }
    }, []);
    if (!ok) return;
    // ponytail: the flow map is kept on this device by server id; nothing reads it yet (a transfers map could).
    const key = (k: string) =>
      ids.current.get(k) ?? draft.find(a => a.key === k)?.id ?? pocketId(k);
    save('flowMap', {
      pos: Object.fromEntries(Object.entries(board.pos).map(([k, p]) => [key(k), p])),
      links: board.links.map(l => ({ from: key(l.from), to: key(l.to) })),
      strokes: board.strokes.map(s => s.pts),
    });
    setClosing(true);
    await wait(380);
    await queryClient.invalidateQueries();
    onDone();
  };

  return (
    <NightRoot className={phase === 'title' || phase === 'date' ? 'n-dark' : ''}>
      {phase === 'title' && <TitleScreen onStart={() => setPhase('date')} />}
      {phase === 'date' && <DateCard today={me.value!.today} onDone={() => setPhase('boot')} />}
      {phase === 'boot' && (
        <div className="tv-boot" aria-hidden="true">
          <i />
        </div>
      )}
      {phase === 'menu' && (
        <NightMenu
          draft={draft}
          setDraft={setDraft}
          undo={undo}
          board={board}
          setBoard={setBoard}
          undoBoard={undoBoard}
          onSave={confirm}
          closing={closing}
        />
      )}
    </NightRoot>
  );
}
