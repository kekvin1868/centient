// An account's pockets under the panel; tap one to set it. Main never shows a kind. Pockets render in, collapse out
// when deleted, and a changed name or balance flashes. Switching accounts redraws the list.
import { formatMoney } from '../../../lib/format';
import { useExits } from '../../../ui/night/useExits';
import type { AccountDraft } from '../model/draft';

export function PocketList({ account, onOpen, onAdd }: { account: AccountDraft | undefined; onOpen: (pocketKey: string) => void; onAdd: () => void }) {
  const shown = useExits(account?.pockets ?? [], p => p.key);
  return (
    <>
      <div className="n-sub"><span>POCKETS</span><button type="button" disabled={!account?.kept} onClick={onAdd}>+ POCKET</button></div>
      <div className="n-pockets" key={account?.key ?? 'none'}>
        {!account ? <p className="n-note">New accounts come with a Main pocket.</p> : shown.map(({ item: p, key, gone }, i) => (
          <button key={gone ? `gone:${key}` : key} type="button" className={`n-pk ${gone ? 'gone' : ''}`} disabled={!account.kept || gone}
            style={{ animationDelay: `${i * 45}ms` }} onClick={() => onOpen(p.key)}>
            <span key={p.name} className="n-val">{p.name}</span>
            <small key={p.kind} className="n-val">{p.main ? '' : p.kind}</small>
            <span key={String(p.balance)} className="money n-val">{p.balance === null ? <span className="unk">???</span> : formatMoney(p.balance)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
