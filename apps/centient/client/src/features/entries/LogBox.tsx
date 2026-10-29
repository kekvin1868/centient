// The log box: what you type turns into cards (chips). No Add button: Enter / Done logs every ready card,
// flick one card up to log just it; cards with a question wait for an answer. Offline, it keeps everything
// and retries when the connection is back.
import { parseQuickAdd } from '@centient/quickadd';
import { KeyReturn, PencilSimple, Question, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { call, client, OfflineError } from '../../lib/api';
import { buzz } from '../../lib/motion';
import { attempt } from '../../lib/run';
import { active, catalog, me, offline, qctx, refresh, selectedAccount } from '../../lib/state';
import { Banner } from '../../ui/Banner';
import { showToast } from '../../ui/Toast';
import { blankForm, chipView, fromDraft, toCommand, type LogItem } from './form';
import { LogChip } from './LogChip';
import { LogSheet } from './LogSheet';

export function LogBox() {
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<string, LogItem>>({});
  const [pending, setPending] = useState<LogItem[]>([]);
  const [sheet, setSheet] = useState<LogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const today = me.value?.today ?? '';
  const iou = active(catalog.value.accounts).find(a => a.kind === 'IOU')?.id ?? null;

  const live = useMemo(() => {
    if (!text.trim() || !qctx.value) return [];
    // The account Home shows is where a line goes unless it names one; else the last one used.
    const ctx = { ...qctx.value, lastAccountId: selectedAccount.value ?? qctx.value.lastAccountId };
    return parseQuickAdd(text, ctx).map((d, i) => {
      const key = `${i}:${d.text}`;
      return edits[key] ?? fromDraft(d, key, iou);
    });
  }, [text, edits, qctx.value, selectedAccount.value]);
  const items = [...live, ...pending];
  const ready = items.filter(i => chipView(i).state === 'ready');

  const update = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.map(p => (p.key === item.key ? item : p)));
    else setEdits({ ...edits, [item.key]: item });
  };
  const remove = (item: LogItem) => {
    if (pending.some(p => p.key === item.key)) setPending(pending.filter(p => p.key !== item.key));
    else setText(live.filter(i => i.key !== item.key).map(i => i.text).join(', '));
  };

  const submit = async () => {
    if (!ready.length) {
      if (items.length) showToast('Answer the question on the card first');
      return;
    }
    setSaving(true);
    try {
      await call(client.api.quickadd.save.$post({
        json: {
          items: ready.map(i => {
            const r = toCommand(i.form);
            if ('error' in r) throw new Error(r.error);
            return { command: r.command, rawMerchant: i.rawMerchant || undefined, suggestedMerchant: i.rawMerchant ? i.suggestedMerchant : undefined };
          }),
        },
      }));
    } catch (e) {
      if (e instanceof OfflineError) offline.value = true;
      else showToast((e as Error).message);
      return;
    } finally {
      setSaving(false);
    }
    offline.value = false;
    buzz(20);
    // Cards still waiting for an answer stay, detached from the cleared box.
    setPending(items.filter(i => chipView(i).state !== 'ready').map((i, n) => ({ ...i, key: `p${Date.now()}-${n}` })));
    setText('');
    setEdits({});
    showToast(ready.length === 1 ? 'Logged' : `Logged ${ready.length} entries`);
    await refresh();
  };

  // Offline: keep everything, try again as soon as the connection is back.
  useEffect(() => {
    const retry = () => { if (offline.value) submit(); };
    addEventListener('online', retry);
    return () => removeEventListener('online', retry);
  });

  /** Logs one card (flicked up, or saved from its sheet). */
  const logOne = async (item: LogItem) => {
    const r = toCommand(item.form);
    if ('error' in r) return false;
    const ok = await attempt(() => call(client.api.quickadd.save.$post({
      json: { items: [{ command: r.command, rawMerchant: item.rawMerchant || undefined, suggestedMerchant: item.rawMerchant ? item.suggestedMerchant : undefined }] },
    })));
    if (!ok) return false;
    buzz(20);
    setSheet(null);
    remove(item);
    showToast('Logged');
    await refresh();
    return true;
  };
  const manual = () => setSheet({
    key: `m${Date.now()}`, text: '', form: { ...blankForm(today), accountId: selectedAccount.value ?? qctx.value?.lastAccountId ?? null },
    candidates: [], askAmount: false, askCharged: false, rawMerchant: '', suggestedMerchant: '',
  });

  // The key on the right says what Enter will do: log (cyan, with a count), answer a card first (?), or,
  // with nothing typed, open the full form.
  const key = ready.length
    ? <button type="submit" className="keycap gap-1 [animation:nudge_1.4s_ease-in-out_infinite]" disabled={saving} aria-label={`Log ${ready.length} entr${ready.length === 1 ? 'y' : 'ies'}`}>
        <span className="flex items-center gap-1"><KeyReturn size={18} weight="bold" aria-hidden="true" />{ready.length > 1 && `×${ready.length}`}</span>
      </button>
    : items.length
      ? <button type="submit" className="keycap keycap-quiet" aria-label="Answer the card first"><Question size={18} weight="bold" aria-hidden="true" /></button>
      : <button type="button" className="keycap keycap-quiet" onClick={manual} aria-label="Add without typing"><PencilSimple size={18} weight="bold" aria-hidden="true" /></button>;

  return (
    <section>
      {offline.value && <Banner><WifiSlash size={18} aria-hidden="true" /> No connection, your entry is still here.</Banner>}
      <form className="panel mx-4 flex items-center gap-2 rounded-[18px] bg-white py-1.5 pl-4 pr-1.5 dark:bg-raised" onSubmit={e => { e.preventDefault(); submit(); }}>
        <span className="text-[16px] text-primary" aria-hidden="true">▶</span>
        <input className="min-w-0 flex-1 bg-transparent py-2 text-[17px] font-medium outline-none placeholder:text-muted" value={text}
          placeholder="What did you spend?" aria-label="What did you spend or receive?" aria-describedby="log-hint" autoComplete="off"
          enterKeyHint="done" onChange={e => setText((e.target as HTMLInputElement).value)} />
        {key}
      </form>
      <p id="log-hint" className="mx-5 mt-2.5 text-[13px] text-muted">
        {ready.length ? 'Enter logs every ready card · flick one up to log just it'
          : items.length ? 'Answer the card below, then press Enter'
          : 'Type it like a text: kopi 25rb gopay, grab 18k'}
      </p>
      <div className="mx-4 mt-3">
        {items.map(i => <LogChip key={i.key} item={i} today={today} onChange={update} onOpen={() => setSheet(i)} onLog={() => logOne(i)} />)}
      </div>
      <LogSheet key={sheet?.key ?? 'none'} item={sheet} onClose={() => setSheet(null)} onSave={logOne} />
    </section>
  );
}
