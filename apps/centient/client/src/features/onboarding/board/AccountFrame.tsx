// One account on the board as a frame holding its pockets, so they move as a group. The header and every pocket
// are ports (data-port) that arrows attach to.
import { ACCOUNT_KINDS, formatMoney } from '../../../lib/format';
import { accountBalance, type AccountDraft } from '../model/draft';

const money = (v: number | null) => (v === null ? <span className="unk">???</span> : formatMoney(v));

type Props = { account: AccountDraft; x: number; y: number; grab: boolean; drop: number; hot: string | null; delay: number };

export function AccountFrame({ account: a, x, y, grab, drop, hot, delay }: Props) {
  return (
    <div className={`cv-grp ${a.kept ? '' : 'off'} ${grab ? 'grab' : ''} ${drop ? 'drop' : ''}`} key={drop} data-frame={a.key}
      style={{ left: x, top: y, animationDelay: `${delay}ms` }}>
      <div className={`cv-head ${hot === a.key ? 'hot' : ''}`} data-port={a.key}>
        <div className="n-ph"><span>{(ACCOUNT_KINDS[a.kind] ?? a.kind).toUpperCase()}</span><span className="money">{a.kept ? money(accountBalance(a)) : 'DROPPED'}</span></div>
        <b>{a.name}</b>
      </div>
      <div className="cv-pks">
        {a.pockets.map(p => (
          <div key={p.key} className={`cv-pk ${hot === p.key ? 'hot' : ''}`} data-port={p.key}>
            <span>{p.name}</span><span className="money">{money(p.balance)}</span>
            {!p.main && <small>{p.kind}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
