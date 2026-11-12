// One pocket's balance on Cash App's keypad, plus its name and kind when it isn't Main. Main is shown as the account's
// BALANCE (never named). Raising an amount asks where the extra comes from, live on the pour bar: a pocket takes it
// From Balance (this account's, the total stays), as Additional Budget (new money, the total grows) or from another
// account (its balance or a pocket, picked in a tree); the BALANCE is Set or filled from another account. Lowering a
// pocket gives the difference back to the balance. SET switches the sheet off like a TV; LEAVE ??? keeps it unknown.
import { useState } from 'react';
import { formatMoney, POCKET_KINDS } from '../../../lib/format';
import { Keypad, keypadKey, keypadValue, pressKey } from '../../../ui/night/Keypad';
import { NightSheet } from '../../../ui/night/NightSheet';
import { typing } from '../../../ui/night/useLayers';
import {
  accountBalance,
  defaultSource,
  editPocket,
  NAME_MAX,
  owes,
  setAmount,
  sources,
  type AccountDraft,
  type Draft,
  type PocketDraft,
  type PocketKind,
  type Source,
} from '../model/draft';
import { PourBar, type Part } from './PourBar';

type Props = {
  draft: Draft;
  account: AccountDraft;
  pocket: PocketDraft;
  /** The whole draft after this change (undo = the one before); `note` toasts with UNDO (money from another account). */
  onSave: (next: Draft, note?: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

type Mode = Source['kind'];

export function PocketSheet({ draft, account, pocket, onSave, onDelete, onClose }: Props) {
  const [digits, setDigits] = useState(pocket.balance === null ? '' : String(pocket.balance));
  const [name, setName] = useState(pocket.name);
  const [kind, setKind] = useState<PocketKind>(pocket.kind);
  const [mode, setMode] = useState<Mode>(defaultSource(account, pocket.main).kind);
  const rows = sources(draft, account.key);
  const [from, setFrom] = useState(rows.find(r => (r.balance ?? 0) > 0) ?? null);
  const [refused, setRefused] = useState(0);
  const at = account.pockets.indexOf(pocket);
  const owe = owes(account.kind);

  const press = (k: string) => {
    const next = pressKey(digits, k);
    if (next === null) setRefused(r => r + 1);
    else setDigits(next);
  };
  const v = keypadValue(digits);
  const old = pocket.balance ?? 0;
  const raising = !owe && v !== null && Boolean(digits) && v > old;
  // While not raising, the switch is hidden and nothing is taken from anywhere.
  const source: Source = !raising
    ? { kind: 'BUDGET' }
    : mode === 'ACCOUNT'
      ? from
        ? { kind: 'ACCOUNT', account: from.account, pocket: from.pocket }
        : { kind: 'BALANCE' }
      : { kind: mode };
  const named = pocket.main ? draft : editPocket(draft, account.key, pocket.key, { name, kind });
  const result = (amount: number | null) =>
    setAmount(named, account.key, pocket.key, amount, source);
  const preview = v !== null && digits ? result(v) : null;
  const short = preview && 'short' in preview ? preview.short : null;

  const save = (amount: number | null, close: () => void) => {
    const r = result(amount);
    if ('short' in r) {
      setRefused(n => n + 1);
      return;
    }
    const took = source.kind === 'ACCOUNT' && from && amount !== null ? amount - old : 0;
    const owner = draft.find(a => a.key === from?.account)?.name;
    onSave(r.draft, took > 0 ? `MOVED ${formatMoney(took)} FROM ${owner}` : undefined);
    close();
  };
  /** SET: what was typed, or a shake when it is a sum that can't be worked out or the source is short. */
  const set = (close: () => void) => {
    if (v === null) setRefused(r => r + 1);
    else save(digits ? v : 0, close);
  };

  const question = owe ? (
    <>
      What do you owe on <em>{account.name}</em>?
    </>
  ) : pocket.main ? (
    <>
      What's in <em>{account.name}</em>?
    </>
  ) : (
    <>How much is in this pocket?</>
  );
  const modes: { value: Mode; label: string }[] = pocket.main
    ? [
        { value: 'BUDGET', label: 'SET AMOUNT' },
        { value: 'ACCOUNT', label: 'FROM ANOTHER ACCOUNT' },
      ]
    : [
        { value: 'BALANCE', label: 'FROM BALANCE' },
        { value: 'BUDGET', label: 'ADDITIONAL BUDGET' },
        { value: 'ACCOUNT', label: 'FROM ANOTHER ACCOUNT' },
      ];
  const bar = raising && preview && 'draft' in preview ? pour(preview.draft) : null;

  /** The pour bar for the preview: what stays, what pours in, what is new. */
  function pour(next: Draft) {
    const delta = v! - old;
    const label = pocket.main ? 'Balance' : name || pocket.name;
    if (source.kind === 'ACCOUNT' && from) {
      const left = next.find(a => a.key === from.account)?.pockets.find(p => p.key === from.pocket);
      const src = draft.find(a => a.key === from.account);
      return (
        <PourBar
          title={from.main ? `${src?.name} · BALANCE` : `${src?.name} · ${from.name}`}
          total={formatMoney(from.balance ?? 0)}
          parts={[
            { label: 'Stays', amount: left?.balance ?? 0, tone: 'base' },
            { label: `→ ${account.name} · ${label}`, amount: delta, tone: 'slice' },
          ]}
        />
      );
    }
    if (pocket.main) return null; // Set amount: just the number
    const a = next.find(x => x.key === account.key)!;
    const main = a.pockets.find(p => p.main)!;
    const others = a.pockets.filter(p => !p.main && p.key !== pocket.key);
    const parts: Part[] = [
      { label: 'Balance', amount: main.balance ?? 0, tone: 'base' },
      ...others.map(p => ({ label: p.name, amount: p.balance ?? 0, tone: 'other' as const })),
    ];
    if (source.kind === 'BALANCE') parts.push({ label, amount: v!, tone: 'slice' });
    else
      parts.push(
        { label, amount: old, tone: 'slice' },
        { label: 'Additional', amount: delta, tone: 'new' },
      );
    const before = accountBalance(account) ?? 0;
    const after = accountBalance(a) ?? 0;
    return (
      <PourBar
        title={account.name}
        total={`${formatMoney(after)}${after === before ? ' · SAME' : ' ↑'}`}
        parts={parts}
      />
    );
  }

  return (
    <NightSheet
      label={pocket.main ? `Balance in ${account.name}` : `${pocket.name} in ${account.name}`}
      title={
        pocket.main
          ? `${account.name} · BALANCE`
          : `${account.name} · POCKET ${at}/${account.pockets.length - 1}`
      }
      meta={
        pocket.main
          ? ''
          : close => (
              <button
                type="button"
                className="n-del"
                onClick={async () => {
                  await close();
                  onDelete();
                }}
              >
                DELETE
              </button>
            )
      }
      onClose={onClose}
      onKey={(e, close) => {
        if (typing(e)) {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          }
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          set(close);
          return;
        }
        if (e.key === '?') {
          save(null, close);
          return;
        }
        const k = keypadKey(e);
        if (k) {
          e.preventDefault();
          press(k);
        }
      }}
    >
      {close => (
        <>
          <div className="k-body">
            <p className="k-q">{question}</p>
            {!pocket.main && (
              <>
                <div className="k-name">
                  <input
                    value={name}
                    maxLength={NAME_MAX}
                    aria-label="Pocket name"
                    autoComplete="off"
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div className="k-kinds">
                  {(['SPENDING', 'SAVINGS'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                    >
                      {POCKET_KINDS[k].toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Keypad
              digits={digits}
              onPress={press}
              empty="???"
              refused={refused}
              between={
                <>
                  {raising && (
                    <div
                      className="k-modes"
                      role="radiogroup"
                      aria-label="Where the money comes from"
                    >
                      {modes.map(m => (
                        <button
                          key={m.value}
                          type="button"
                          role="radio"
                          aria-checked={mode === m.value}
                          onClick={() => setMode(m.value)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {raising && mode === 'ACCOUNT' && (
                    <div className="n-pockets k-tree" role="radiogroup" aria-label="Take from">
                      {rows.length ? (
                        rows.map(r => (
                          <button
                            key={r.pocket}
                            type="button"
                            role="radio"
                            className={`n-pk ${r.main ? '' : 'sub'}`}
                            aria-checked={from?.pocket === r.pocket}
                            disabled={!r.balance}
                            onClick={() => setFrom(r)}
                          >
                            <span>
                              {!r.main && <i aria-hidden="true">└ </i>}
                              {r.name}
                            </span>
                            <small>{r.main ? 'BALANCE' : ''}</small>
                            <span className="money">
                              {r.balance === null ? (
                                <span className="unk">???</span>
                              ) : (
                                formatMoney(r.balance)
                              )}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="n-note">No other account holds money yet.</p>
                      )}
                    </div>
                  )}
                  {bar}
                  {short && (
                    <p className="k-short" role="alert">
                      {short.name} has {formatMoney(short.have)}
                    </p>
                  )}
                  {!raising && !pocket.main && digits && v !== null && v < old && (
                    <p className="n-note k-back">{formatMoney(old - v)} goes back to the balance</p>
                  )}
                </>
              }
            />
          </div>
          <div className="k-acts">
            <button type="button" className="n-btn" onClick={() => save(null, close)}>
              LEAVE ???
            </button>
            <button type="button" className="n-go" onClick={() => set(close)}>
              SET ▸
            </button>
          </div>
        </>
      )}
    </NightSheet>
  );
}
