// A goal's Activity (step 6): how it stands (pixel bar, saved of target, what to put in each cycle and by when, or
// "Goal reached" / "Past target date"), then every entry that moved money in or out of it, newest first, with the
// goal's balance after each. 50 at a time; edits and deletes anywhere reload it.
import { Block, Button } from 'konsta/react';
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { formatMoney, goalLine } from '../../lib/format';
import { attempt } from '../../lib/run';
import { version } from '../../lib/state';
import { Sheet } from '../../ui/Sheet';
import { EntryList, type Entry } from '../entries/EntryList';
import { GoalBar, type Pocket } from './PocketCards';

type Goal = {
  currency: string;
  balance: number;
  target: number;
  targetDate: string | null;
  progress: number;
  state: string;
  cyclesLeft: number | null;
  neededPerCycle: number | null;
};

export function GoalActivitySheet({
  pocket,
  open,
  onClose,
  onOpen,
}: {
  pocket: Pocket | null;
  open: boolean;
  onClose: () => void;
  onOpen: (e: Entry) => void;
}) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  // The entry tapped opens once this sheet has gone, not on top of it.
  const [chosen, setChosen] = useState<Entry | null>(null);
  const load = (more: boolean) =>
    pocket &&
    attempt(async () => {
      const page = await call(
        client.api.envelopes[':id'].activity.$get({
          param: { id: pocket.id },
          query: { cursor: more && cursor ? cursor : undefined },
        }),
      );
      const rows = (page.items as Entry[]).map(e => ({
        ...e,
        pocket: { ...e.pocket!, currency: page.goal.currency },
      }));
      setGoal(page.goal);
      setItems(more ? [...items, ...rows] : rows);
      setCursor(page.nextCursor);
    });
  useEffect(() => {
    if (open) load(false);
  }, [open, pocket?.id, version.value]);
  const line = goal && goalLine(goal);
  return (
    <Sheet
      open={open && pocket !== null}
      onClose={onClose}
      title={pocket ? `${pocket.name} · Activity` : ''}
      onClosed={() => {
        if (chosen) {
          onOpen(chosen);
          setChosen(null);
        }
      }}
    >
      {goal === null ? (
        <p className="px-4 py-6 text-muted">Loading…</p>
      ) : (
        <>
          <div className="mx-4 mb-4 mt-1" data-testid="goal-outlook">
            <div className="flex items-center gap-2 text-[15px] font-bold">
              <GoalBar share={Math.min(1, Math.max(0, goal.balance / goal.target))} />
              {goal.progress}%
            </div>
            <p className="num mt-2 text-[17px] font-semibold">
              {formatMoney(goal.balance, goal.currency)} of{' '}
              {formatMoney(goal.target, goal.currency)}
            </p>
            {line && <p className="mt-1 text-[15px] text-muted">{line}</p>}
          </div>
          <EntryList
            entries={items}
            onOpen={e => {
              setChosen(e);
              onClose();
            }}
            empty="Nothing has moved in or out yet."
          />
          {cursor && (
            <Block>
              <Button large rounded tonal onClick={() => load(true)}>
                Load more
              </Button>
            </Block>
          )}
        </>
      )}
    </Sheet>
  );
}
