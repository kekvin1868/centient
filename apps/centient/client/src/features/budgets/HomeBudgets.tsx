// Home's budget card, under the balance card. All accounts: one card, every rupiah budget added up, then a bar per
// budget named with its account. One account: one card for that account's budgets (budgets on its pockets): a stacked bar (each budget its own colour, spent bright,
// left faint), then a row per budget with a retro HP bar (HP = what is left). No card when the account has none.
// Category-only budgets span every account, so they count on All accounts only.
import { formatMoney } from '../../lib/format';
import { categoryEmoji } from '../../lib/labels';
import { catalog, nameOf, type Catalog } from '../../lib/state';
import { budgetName, type Budget, type BudgetCycle } from '../../models/budget';
import {
  forecastView,
  loadStartDay,
  rupiahLeft,
  startDayFor,
  type BudgetStatus,
} from '../../models/forecast';
import { StatusTag } from './StatusTag';

/** The budgets on this account's pockets, in its currency, cycle ones first. */
export function accountBudgets(
  budgets: Budget[],
  pockets: { id: string; account_id: string }[],
  account: { id: string; currency_code: string },
) {
  const mine = new Set(pockets.filter(p => p.account_id === account.id).map(p => p.id));
  return budgets
    .filter(b => b.envelopeId && mine.has(b.envelopeId) && b.currency === account.currency_code)
    .sort((x, y) => Number(Boolean(x.startsOn)) - Number(Boolean(y.startsOn)));
}

/** HP colour by what is left: green over half, yellow over a fifth, red below (and when spent past the limit). */
export function hpTone(left: number, limit: number) {
  const r = limit > 0 ? left / limit : 0;
  return r > 0.5 ? 'green' : r > 0.2 ? 'yellow' : 'red';
}

const SLICES = 5; // --slice-1..5 in styles.css; a sixth budget reuses the first colour
const slice = (i: number) => `var(--slice-${(i % SLICES) + 1})`;

const statusOf = (b: Budget, cycle: BudgetCycle): BudgetStatus | undefined => {
  const day = loadStartDay();
  return (
    b.startsOn
      ? forecastView(b, startDayFor(day, b.cycleDays), b.endsOn!)
      : forecastView(b, day, cycle.to)
  ).status;
};

/** A row's name: the category, then the pocket unless it is Main; on All accounts the account first. */
const shortName = (b: Budget, cat: Catalog, withAccount: boolean) => {
  const pocket = cat.envelopes.find(e => e.id === b.envelopeId);
  const isMain = pocket && cat.accounts.some(a => a.default_envelope_id === pocket.id);
  return (
    [
      b.categoryId && nameOf(cat.categories, b.categoryId),
      withAccount && pocket && nameOf(cat.accounts, pocket.account_id),
      pocket && !isMain && pocket.name,
    ]
      .filter(Boolean)
      .join(' · ') || budgetName(b, cat)
  );
};

const resets = (d: number) => `Resets in ${d} day${d === 1 ? '' : 's'}`;
const card = 'panel relative mx-4 mb-5 rounded-[20px] bg-raised px-4 pt-3 pb-4';

function Tag({ children }: { children: string }) {
  return (
    <span className="shrink-0 rotate-2 rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-raised">
      {children}
    </span>
  );
}

// The HP bar as pixel art on a 56 × 7 grid, drawn 2× (112 × 14). Each entry is [x, y, w, h, colour token].
type Px = [number, number, number, number, string];
const HP_TEXT = ['X..X.XXX.', 'XXXX.X..X', 'X..X.XXX.', 'X..X.X...']; // "HP", 4 rows, starts at x 2
const HP_TEXT_ROW = ['hp-label', 'hp-label', 'hp-label-2', 'hp-label-2'];
const TRACK = 40; // fill pixels, x 13..52
const HP_BASE: Px[] = [
  // frame: dark edge with clipped corners, slate inside
  [2, 0, 52, 7, 'hp-edge'],
  [1, 1, 54, 5, 'hp-edge'],
  [0, 2, 56, 3, 'hp-edge'],
  [2, 1, 52, 5, 'hp-frame'],
  [1, 2, 54, 3, 'hp-frame'],
  // "HP" with a shadow under the last row
  ...HP_TEXT.flatMap((row, y) =>
    [...row].flatMap((c, x): Px[] => (c === 'X' ? [[2 + x, 1 + y, 1, 1, HP_TEXT_ROW[y]!]] : [])),
  ),
  ...[...HP_TEXT[3]!].flatMap((c, x): Px[] =>
    c === 'X' ? [[2 + x, 5, 1, 1, 'hp-label-shadow']] : [],
  ),
  // white rim with rounded ends, then the empty track (dark top line)
  [13, 1, 40, 5, 'hp-rim'],
  [12, 2, 42, 3, 'hp-rim'],
  [13, 2, TRACK, 1, 'hp-track'],
  [13, 3, TRACK, 2, 'hp-frame'],
];

/** A retro handheld-game HP bar: HP = what is left; drains green, then yellow, then red. */
function Hp({ left, limit }: { left: number; limit: number }) {
  const w = limit > 0 ? Math.min(1, Math.max(0, left / limit)) : 0;
  const n = w > 0 ? Math.max(1, Math.round(w * TRACK)) : 0;
  const tone = `hp-${hpTone(left, limit)}`;
  const px: Px[] = n ? [...HP_BASE, [13, 2, n, 1, `${tone}-shade`], [13, 3, n, 2, tone]] : HP_BASE;
  return (
    <svg
      aria-hidden="true"
      width="112"
      height="14"
      viewBox="0 0 56 7"
      shapeRendering="crispEdges"
      className="shrink-0"
    >
      {px.map(([x, y, pw, ph, c], i) => (
        <rect key={i} x={x} y={y} width={pw} height={ph} style={{ fill: `var(--${c})` }} />
      ))}
    </svg>
  );
}

export function HomeBudgets({
  budgets,
  cycle,
  account,
  onGo,
}: {
  budgets: Budget[];
  cycle: BudgetCycle;
  /** The account Home shows; null = All accounts. */
  account: { id: string; name: string; currency_code: string } | null;
  onGo: () => void;
}) {
  const cat = catalog.value;
  if (!account) {
    const { count, left, perDay } = rupiahLeft(budgets);
    if (!count)
      return (
        <button
          type="button"
          onClick={onGo}
          className={`${card} block w-[calc(100%-2rem)] text-left`}
        >
          <h3 className="text-[15px] font-bold">No budget yet</h3>
          <p className="mt-1 text-[14px] text-muted">Add one on Money to see a daily amount ▸</p>
        </button>
      );
    // Every rupiah budget, each its own bar, named with its account (cycle ones first).
    const rows = budgets
      .filter(b => b.currency === 'IDR')
      .sort((x, y) => Number(Boolean(x.startsOn)) - Number(Boolean(y.startsOn)));
    return (
      <section className={card} aria-label="Budget left">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-bold">Budget left</h3>
          <Tag>{resets(cycle.daysLeft)}</Tag>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className={`num text-[24px] font-bold ${left <= 0 ? 'text-negative' : ''}`}>
            {formatMoney(left)}
          </span>
          <span className="text-[14px] text-muted">
            {left > 0 ? `About ${formatMoney(perDay)} a day` : 'All used up'}
          </span>
        </div>
        <Bars rows={rows} cycle={cycle} currency="IDR" withAccount />
      </section>
    );
  }

  const rows = accountBudgets(budgets, cat.envelopes, account);
  if (!rows.length) return null;
  const cur = account.currency_code;
  const limit = rows.reduce((s, b) => s + b.limit, 0);
  const left = rows.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  return (
    <section className={card} aria-label={`Budgets in ${account.name}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">Budgets in {account.name}</h3>
        <Tag>{resets(cycle.daysLeft)}</Tag>
      </div>
      <p className="mt-1 text-[14px] text-muted">
        <span className="num font-bold text-ink">{formatMoney(left, cur)}</span> left of{' '}
        <span className="num">{formatMoney(limit, cur)}</span>
      </p>
      <Bars rows={rows} cycle={cycle} currency={cur} withAccount={false} />
    </section>
  );
}

/** The stacked bar (each budget's width is its share of the limits; spent bright, the rest faint), then a row per budget. */
function Bars({
  rows,
  cycle,
  currency: cur,
  withAccount,
}: {
  rows: Budget[];
  cycle: BudgetCycle;
  currency: string;
  withAccount: boolean;
}) {
  const cat = catalog.value;
  return (
    <>
      <div aria-hidden="true" className="mt-2 flex h-3 gap-[2px] overflow-hidden rounded-[3px]">
        {rows.map((b, i) => (
          <span
            key={b.id}
            className="relative h-full"
            style={{
              flexGrow: b.limit,
              background: `color-mix(in oklab, ${slice(i)} 28%, transparent)`,
            }}
          >
            <span
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.min(1, b.limit > 0 ? b.spent / b.limit : 1) * 100}%`,
                background: slice(i),
              }}
            />
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((b, i) => {
          const status = statusOf(b, cycle);
          const emoji = b.categoryId ? categoryEmoji(nameOf(cat.categories, b.categoryId)) : '👛';
          return (
            <li key={b.id} className="flex items-center gap-2 text-[14px]">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: slice(i) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {emoji} {shortName(b, cat, withAccount)}
                </span>
                {status && <StatusTag status={status} />}
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <Hp left={b.remaining} limit={b.limit} />
                <span className="num text-[12px] text-muted">
                  {formatMoney(Math.max(0, b.remaining), cur)} / {formatMoney(b.limit, cur)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
