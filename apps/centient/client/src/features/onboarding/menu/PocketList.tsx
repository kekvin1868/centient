// An account's balance (its Main pocket, never named) big at the top, then its other pockets; tap either to set it.
// Pockets render in, collapse out when deleted, and a changed name or balance flashes. Switching accounts redraws
// the list. A card / pay later has no pockets: its hero is what is USED of the limit, and a tap opens its card sheet.
import { formatMoney } from '../../../lib/format';
import { useExits } from '../../../ui/night/useExits';
import { isCard } from '../../../../../src/domain/recurring';
import type { AccountDraft } from '../model/draft';

export function PocketList({
  account,
  onOpen,
  onAdd,
  onCard,
}: {
  account: AccountDraft | undefined;
  onOpen: (pocketKey: string) => void;
  onAdd: () => void;
  onCard: () => void;
}) {
  const main = account?.pockets.find(p => p.main);
  const card = account && isCard(account.kind);
  const shown = useExits(account?.pockets.filter(p => !p.main) ?? [], p => p.key);
  return (
    <>
      {main && (
        <button
          type="button"
          className="n-hero"
          disabled={!account!.kept}
          aria-label={`${card ? 'Used' : 'Balance'}, ${main.balance === null ? 'not set' : formatMoney(main.balance)}`}
          onClick={() => (card ? onCard() : onOpen(main.key))}
        >
          <small>{card ? 'USED' : 'BALANCE'}</small>
          <span key={String(main.balance)} className="money n-val">
            {main.balance === null ? <span className="unk">???</span> : formatMoney(main.balance)}
          </span>
        </button>
      )}
      {card ? (
        <p className="n-note">A card has no pockets: its balance is what is used of its limit.</p>
      ) : (
        <PocketRows account={account} shown={shown} onOpen={onOpen} onAdd={onAdd} />
      )}
    </>
  );
}

function PocketRows({
  account,
  shown,
  onOpen,
  onAdd,
}: {
  account: AccountDraft | undefined;
  shown: ReturnType<typeof useExits<AccountDraft['pockets'][number]>>;
  onOpen: (pocketKey: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="n-sub">
        <span>POCKETS</span>
        <button type="button" disabled={!account?.kept} onClick={onAdd}>
          + POCKET
        </button>
      </div>
      <div className="n-pockets" key={account?.key ?? 'none'}>
        {!account ? (
          <p className="n-note">
            New accounts start with a balance; add pockets for savings or bills.
          </p>
        ) : (
          shown.map(({ item: p, key, gone }, i) => (
            <button
              key={gone ? `gone:${key}` : key}
              type="button"
              className={`n-pk ${gone ? 'gone' : ''}`}
              disabled={!account.kept || gone}
              style={{ animationDelay: `${i * 45}ms` }}
              onClick={() => onOpen(p.key)}
            >
              <span key={p.name} className="n-val">
                {p.name}
              </span>
              <small key={p.kind} className="n-val">
                {p.kind}
              </small>
              <span key={String(p.balance)} className="money n-val">
                {p.balance === null ? <span className="unk">???</span> : formatMoney(p.balance)}
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
