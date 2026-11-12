// The log box: what you type turns into cards (chips). No Add button: Enter / Done logs every ready card,
// flick one card up to log just it; cards with a question wait for an answer. Offline, it keeps everything
// and retries when the connection is back.
import { parseQuickAdd, resolveSums } from '@centient/quickadd';
import {
  ArrowCounterClockwise,
  KeyReturn,
  PencilSimple,
  Question,
  WifiSlash,
} from '@phosphor-icons/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { OfflineError } from '../../lib/api';
import { buzz } from '../../lib/motion';
import {
  active,
  catalog,
  me,
  offline,
  qctx,
  selectedAccount,
  selectedPocket,
} from '../../lib/state';
import { Banner } from '../../ui/Banner';
import { showToast } from '../../ui/Toast';
import { blankForm, chipView, fromDraft, toCommand, type LogItem } from './form';
import { LogChip } from './LogChip';
import { LogGuideSheet } from './LogGuideSheet';
import { LogSheet } from './LogSheet';
import { PocketStamps } from './PocketStamps';
import { entryApi } from '../../models/entry';
import { persist } from '../../models/query';

export function LogBox() {
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<string, LogItem>>({});
  const [pending, setPending] = useState<LogItem[]>([]);
  const [sheet, setSheet] = useState<LogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [guide, setGuide] = useState(false);
  // The last sum "=" worked out: `to` is the line it left, `from` the line as typed. Good until the line changes.
  const [sum, setSum] = useState<{ from: string; to: string } | null>(null);
  const undoable = sum?.to === text ? sum : null;
  const input = useRef<HTMLInputElement>(null);
  const today = me.value?.today ?? '';
  // Typing stays instant: the cards are worked out from a copy React may let lag a key or two behind.
  const typed = useDeferredValue(text);

  const cardsFor = (line: string) => {
    if (!line.trim() || !qctx.value) return [];
    // The account Home shows is where a line goes unless it names one; else the last one used. Rupiah accounts only:
    // a typed "25rb" is rupiah, and on a crypto account it would be read as that coin's smallest units.
    // (A person's tab can be on Home for its Activity; a line is never spent from one.)
    const shown = catalog.value.accounts.find(a => a.id === selectedAccount.value);
    const home = shown?.kind === 'IOU' ? undefined : shown;
    const ctx = {
      ...qctx.value,
      lastAccountId: home?.currency_code === 'IDR' ? home.id : qctx.value.lastAccountId,
    };
    return parseQuickAdd(line, ctx).map((d, i) => {
      const key = `${i}:${d.text}`;
      const item = edits[key] ?? fromDraft(d, key, null);
      // The stamp under the box applies to lines on Home's account; one naming another account ignores it.
      return !edits[key] && d.type !== 'TRANSFER' && home && item.form.accountId === home.id
        ? { ...item, form: { ...item.form, envelopeId: selectedPocket.value } }
        : item;
    });
  };
  const live = useMemo(
    () => cardsFor(typed),
    [typed, edits, qctx.value, selectedAccount.value, selectedPocket.value, catalog.value],
  );
  const items = [...live, ...pending];
  const homeAccount = catalog.value.accounts.find(a => a.id === selectedAccount.value);
  const stamps = active(catalog.value.envelopes).filter(e => e.account_id === homeAccount?.id);
  const ready = items.filter(i => chipView(i).state === 'ready');

  const undoSum = () => {
    if (!undoable) return;
    setText(undoable.from);
    input.current?.focus();
  };
  const typeLine = (v: string) => {
    // Backspace right after a sum brings the sum back instead of eating the result.
    if (undoable && v.length === text.length - 1) return setText(undoable.from);
    const line = v.includes('=') ? resolveSums(v) : v;
    if (line !== v) setSum({ from: v.replace(/=/g, '').trimEnd(), to: line });
    setText(line);
  };

  const update = (item: LogItem) => {
    if (pending.some(p => p.key === item.key))
      setPending(pending.map(p => (p.key === item.key ? item : p)));
    else setEdits({ ...edits, [item.key]: item });
  };
  const remove = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.filter(p => p.key !== item.key));
    else
      setText(
        live
          .filter(i => i.key !== item.key)
          .map(i => i.text)
          .join(', '),
      );
  };

  /** The stamp stays on the pocket last logged to. */
  const remember = (item?: LogItem) => {
    if (item && item.form.type !== 'TRANSFER' && item.form.accountId === selectedAccount.value)
      selectedPocket.value = item.form.envelopeId;
  };

  const submit = async () => {
    // Enter can beat the deferred cards: always log what is in the box now.
    const items = [...(typed === text ? live : cardsFor(text)), ...pending];
    const ready = items.filter(i => chipView(i).state === 'ready');
    if (!ready.length) {
      if (items.length) showToast('Answer the question on the card first');
      return;
    }
    setSaving(true);
    const ok = await persist(
      () =>
        entryApi.quickSave({
          items: ready.flatMap(i => {
            const r = toCommand(i.form);
            if ('error' in r) throw new Error(r.error);
            return [
              {
                command: r.command,
                rawMerchant: i.rawMerchant || undefined,
                suggestedMerchant: i.rawMerchant ? i.suggestedMerchant : undefined,
              },
              ...(r.extra ?? []).map(command => ({ command })),
            ];
          }),
        }),
      undefined,
      // Offline: keep everything and show the banner; it retries when the connection is back.
      e => (e instanceof OfflineError ? (offline.value = true) : showToast(e.message)),
    );
    setSaving(false);
    if (!ok) return;
    remember(ready.at(-1));
    offline.value = false;
    buzz(20);
    // Cards still waiting for an answer stay, detached from the cleared box.
    setPending(
      items
        .filter(i => chipView(i).state !== 'ready')
        .map((i, n) => ({ ...i, key: `p${Date.now()}-${n}` })),
    );
    setText('');
    setEdits({});
    showToast(ready.length === 1 ? 'Logged' : `Logged ${ready.length} entries`);
  };

  // Offline: keep everything, try again as soon as the connection is back.
  useEffect(() => {
    const retry = () => {
      if (offline.value) submit();
    };
    addEventListener('online', retry);
    return () => removeEventListener('online', retry);
  });

  /** Logs one card (flicked up, or saved from its sheet). */
  const logOne = async (item: LogItem) => {
    const r = toCommand(item.form);
    if ('error' in r) return false;
    const ok = await persist(() =>
      entryApi.quickSave({
        items: [
          {
            command: r.command,
            rawMerchant: item.rawMerchant || undefined,
            suggestedMerchant: item.rawMerchant ? item.suggestedMerchant : undefined,
          },
          ...(r.extra ?? []).map(command => ({ command })),
        ],
      }),
    );
    if (!ok) return false;
    remember(item);
    buzz(20);
    setSheet(null);
    remove(item);
    showToast('Logged');
    return true;
  };
  const manual = () =>
    setSheet({
      key: `m${Date.now()}`,
      text: '',
      form: {
        ...blankForm(today),
        accountId: selectedAccount.value ?? qctx.value?.lastAccountId ?? null,
        envelopeId: selectedPocket.value,
      },
      candidates: [],
      askAmount: false,
      askCharged: false,
      rawMerchant: '',
      suggestedMerchant: '',
    });

  // The key on the right says what Enter will do: log (cyan, with a count), or, with nothing typed, open the full
  // form. While a card still asks something it is `?`: the logging guide (Enter still says to answer the card).
  const key = ready.length ? (
    <button
      type="submit"
      className="keycap gap-1 [animation:nudge_1.4s_ease-in-out_infinite]"
      disabled={saving}
      aria-label={`Log ${ready.length} entr${ready.length === 1 ? 'y' : 'ies'}`}
    >
      <span className="flex items-center gap-1">
        <KeyReturn size={18} weight="bold" aria-hidden="true" />
        {ready.length > 1 && `×${ready.length}`}
      </span>
    </button>
  ) : items.length ? (
    <button
      type="button"
      className="keycap keycap-quiet"
      onClick={() => setGuide(true)}
      aria-label="How to log"
    >
      <Question size={18} weight="bold" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      className="keycap keycap-quiet"
      onClick={manual}
      aria-label="Add without typing"
    >
      <PencilSimple size={18} weight="bold" aria-hidden="true" />
    </button>
  );

  return (
    <section>
      {offline.value && (
        <Banner>
          <WifiSlash size={18} aria-hidden="true" /> No connection, your entry is still here.
        </Banner>
      )}
      <form
        className="panel mx-4 flex items-center gap-2 rounded-[18px] bg-white py-1.5 pl-4 pr-1.5 dark:bg-raised"
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="text-[16px] text-primary" aria-hidden="true">
          ▶
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-[17px] font-medium outline-none placeholder:text-muted"
          value={text}
          placeholder="What did you spend?"
          aria-label="What did you spend or receive?"
          aria-describedby="log-hint"
          autoComplete="off"
          enterKeyHint="done"
          // A sum closed with "=" turns into its result as it is typed (19k/3= -> 6.333).
          ref={input}
          onKeyDown={e => {
            // Cmd+Z / Ctrl+Z. The browser's own undo can't see a line we rewrote, so this one is ours.
            if (
              undoable &&
              (e.metaKey || e.ctrlKey) &&
              !e.shiftKey &&
              e.key.toLowerCase() === 'z'
            ) {
              e.preventDefault();
              undoSum();
            }
          }}
          onChange={e => typeLine((e.target as HTMLInputElement).value)}
        />
        {undoable && (
          <button
            type="button"
            className="keycap keycap-quiet"
            onMouseDown={e => e.preventDefault()} // keeps the phone's keyboard open
            onClick={undoSum}
          >
            <span className="flex items-center gap-1">
              <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
              Undo
            </span>
          </button>
        )}
        {key}
      </form>
      <p id="log-hint" className="mx-5 mt-2.5 text-[13px] text-muted">
        {undoable
          ? `Worked out from ${undoable.from}`
          : ready.length
            ? 'Enter logs every ready card · flick one up to log just it'
            : items.length
              ? 'Answer the card below, then press Enter'
              : 'Type it like a text: kopi 25rb gopay, grab 18k'}
      </p>
      {stamps.length > 1 && (
        <div className="mx-5 mt-2.5">
          <PocketStamps
            label="Log to pocket"
            pockets={stamps}
            mainId={homeAccount?.default_envelope_id ?? null}
            value={selectedPocket.value}
            onChange={p => (selectedPocket.value = p)}
          />
        </div>
      )}
      <div className="mx-4 mt-3">
        {items.map((i, n) => (
          <LogChip
            // Live cards keep their place while you type, so a key press updates them instead of remounting
            // each one (and replaying its entrance); `i.key` (with the text) still ties edits to the words.
            key={n < live.length ? `live:${n}` : i.key}
            item={i}
            today={today}
            onChange={update}
            onOpen={() => setSheet(i)}
            onLog={() => logOne(i)}
          />
        ))}
      </div>
      <LogGuideSheet open={guide} onClose={() => setGuide(false)} />
      <LogSheet
        key={sheet?.key ?? 'none'}
        item={sheet}
        onClose={() => setSheet(null)}
        onSave={logOne}
      />
    </section>
  );
}
