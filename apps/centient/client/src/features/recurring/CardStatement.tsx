// Under a lifted credit card / pay later account: its one bill, the way the bank prints it. The lines (unpaid
// from the bill before, spending, each plan's slice, interest), what was paid since and what is left by when,
// and what was spent since (that goes on the next bill). "I paid it" logs a transfer into the card, any amount
// (a short payment carries over; Full / Minimum once the minimum is typed). "Enter statement" types what the bank's
// statement says (total, minimum, interest); the bill then shows whether it matches, and if not, what to do: the
// bank asks more = log the missing spending or the interest; the app has more = check its lines. An installment
// line opens its plan, an interest line its entry (to fix or delete it). A card made before limits and bill days
// were required gets a key that opens its settings.
import { useRecurring } from '../../models/useWaiting';
import { cardSetUp } from '../../../../src/domain/recurring';
import { Button } from 'konsta/react';
import { useState, type ReactNode } from 'react';
import { EditAccountSheet } from '../accounts/EditAccountSheet';
import type { Entry } from '../entries/EntryList';
import { EntrySheet } from '../entries/EntrySheet';
import { PlanSheet } from '../installments/PlanSheet';
import { usePlans } from '../installments/plans';
import { attempt } from '../../lib/run';
import { entryApi } from '../../models/entry';
import { formatMoney } from '../../lib/format';
import { catalog } from '../../lib/state';
import {
  billLines,
  dueWords,
  interestSources,
  minimumState,
  nextBillName,
  paidExtra,
  type BillLine,
  statementGap,
  statementOf,
} from '../../models/recurring';
import { dayWords } from '../../models/dates';
import { outboxItems } from '../../models/outbox';
import { blankForm, toCommand, type LogItem } from '../entries/form';
import { LogSheet } from '../entries/LogSheet';
import { showToast } from '../../ui/Toast';
import { Tag, type TagTone } from '../../ui/Tag';
import type { Account } from '../../../../src/repos/accounts';
import { dateText } from '../../ui/Fields';
import { StatementSheet } from './StatementSheet';
import { PayCardSheet } from './PayCardSheet';

/** Each kind of bill line, as its tag on the receipt. */
const LINE_TAG: Record<BillLine['kind'], { word: string; tone: TagTone }> = {
  carry: { word: 'unpaid', tone: 'warn' },
  credit: { word: 'credit', tone: 'ok' },
  spent: { word: 'spent', tone: 'plain' },
  slice: { word: 'installment', tone: 'miku' },
  interest: { word: 'interest', tone: 'pink' },
  waiting: { word: 'waiting', tone: 'plain' },
};

/** The rubber stamp on the receipt: how the bill stands. */
const STAMP = {
  paid: { word: 'PAID', tone: 'ok' },
  paidPlus: { word: 'PAID +', tone: 'ok' },
  min: { word: 'MIN PAID', tone: 'warn' },
  below: { word: 'BELOW MIN', tone: 'bad' },
  late: { word: 'LATE', tone: 'bad' },
  due: { word: 'DUE', tone: 'ink' },
} as const;
/** Stamp ink on the paper (the paper is light in both themes). */
const STAMP_INK = { ok: '#1d7a44', warn: '#9a6400', bad: '#c2185b', ink: '#22262a' } as const;

const short = (day: string) => dayWords(day, { day: 'numeric', month: 'short' });

/** A note under the receipt: a tag, a line in bold, then what it means. */
function Callout({
  tag,
  title,
  label,
  children,
}: {
  tag: ReactNode;
  title: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="panel bg-white px-4 py-3 dark:bg-raised" role="status" aria-label={label}>
      <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
        {tag}
        <span>{title}</span>
      </p>
      <p className="mt-1.5 text-[15px] leading-snug text-muted">{children}</p>
    </div>
  );
}

export function CardStatement({ account }: { account: Account }) {
  const { data } = useRecurring();
  const [paying, setPaying] = useState(false);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const plans = usePlans(account.id);
  const setUp = cardSetUp(account);
  const card = data?.cards.find(c => c.accountId === account.id);
  const money = (n: number) => formatMoney(n, account.currency_code);
  const sources = card ? interestSources(card) : [];
  const statement = card ? statementOf(card, outboxItems.value) : null;
  const gap = card && statement ? statementGap(card, statement.total) : null;
  const min = card ? minimumState(card, statement) : null;
  const extra = card ? paidExtra(card) : 0;
  const stamp = !card
    ? STAMP.due
    : card.left === 0
      ? extra > 0
        ? STAMP.paidPlus
        : STAMP.paid
      : min?.kind === 'minimum'
        ? STAMP.min
        : min?.kind === 'below'
          ? STAMP.below
          : card.dueOn && card.dueOn < (data?.today ?? '')
            ? STAMP.late
            : STAMP.due;
  const [missing, setMissing] = useState<LogItem | null>(null);
  // "Log missing spending": a new expense on this card for the gap, dated on the bill's closing day (on this bill).
  const logMissing = () =>
    card &&
    gap &&
    setMissing({
      key: `missing:${card.cutOff}`,
      text: '',
      form: { ...blankForm(card.cutOff), accountId: account.id, amount: gap },
      candidates: [],
      askAmount: false,
      askCharged: false,
      rawMerchant: '',
      suggestedMerchant: '',
    });
  const saveMissing = (i: LogItem) =>
    attempt(async () => {
      const r = toCommand(i.form);
      if ('error' in r) throw new Error(r.error);
      await entryApi.logAll([r.command, ...(r.extra ?? [])].map(command => ({ command })));
      setMissing(null);
      showToast('Logged');
    });

  return (
    <section className="mt-5" aria-label="Card bill">
      <div className="mb-2 flex">
        <h3 className="section-title text-[17px] tracking-[-0.02em]">Card bill</h3>
      </div>
      {!setUp ? (
        <>
          <p className="text-[15px] text-muted">
            {account.name} needs its limit and bill days before it can show a bill.
          </p>
          <Button large rounded className="mt-3" onClick={() => setEditing(true)}>
            Set limit and bill days ▸
          </Button>
          {editing && (
            <EditAccountSheet
              account={catalog.value.accounts.find(x => x.id === account.id) ?? null}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      ) : (
        data &&
        card && (
          <>
            <p className="num text-[28px] font-extrabold leading-tight">{money(card.left)}</p>
            <p className="text-[15px] text-muted">
              {card.left === 0
                ? `Nothing left to pay of the bill closed on ${dateText(card.cutOff)}.`
                : `Left to pay of the bill closed on ${dateText(card.cutOff)}.${card.dueOn ? ` ${dueWords(card.dueOn, data.today)}.` : ''}`}
            </p>

            <div className="receipt-stage mt-4">
              <div className="receipt bill-receipt">
                <span
                  className="receipt-stamp bill-receipt-stamp"
                  style={{ color: STAMP_INK[stamp.tone] }}
                  aria-hidden="true"
                >
                  {stamp.word}
                </span>
                <p className="bill-receipt-name">{account.name}</p>
                <p className="bill-receipt-sub">
                  Closed {short(card.cutOff)}
                  {card.dueOn && ` · pay by ${short(card.dueOn)}`}
                </p>
                <ul className="mt-3" aria-label="Bill lines">
                  {billLines(card).map(l => {
                    const open = l.planId
                      ? () => setPlanId(l.planId!)
                      : l.entryId
                        ? () => attempt(async () => setEntry(await entryApi.get(l.entryId!)))
                        : null;
                    const { word, tone } = LINE_TAG[l.kind];
                    const body = (
                      <>
                        <Tag tone={tone}>{word}</Tag>
                        <span className="min-w-0 flex-1 truncate">{l.detail}</span>
                        {l.paid && <Tag tone="ok">✓ paid</Tag>}
                        <span className="num shrink-0 font-bold">{money(l.amount)}</span>
                        {open && (
                          <span aria-hidden="true" className="-ml-1 text-[var(--paper-faint)]">
                            ›
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li
                        key={l.key}
                        className="bill-receipt-line"
                        aria-label={`${l.label}, ${money(l.amount)}`}
                      >
                        {open ? (
                          <button
                            type="button"
                            aria-label={`${l.label}, ${money(l.amount)}`}
                            className="bill-receipt-row w-full text-left active:opacity-60"
                            onClick={open}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="bill-receipt-row">{body}</div>
                        )}
                      </li>
                    );
                  })}
                  <li className="bill-receipt-sum" aria-label={`Bill, ${money(card.bill)}`}>
                    <span>Bill</span>
                    <span className="num">{money(card.bill)}</span>
                  </li>
                  {card.paidSince > 0 && (
                    <li
                      className="bill-receipt-paid"
                      aria-label={`Paid since ${short(card.cutOff)}, −${money(card.paidSince)}`}
                    >
                      <span>Paid since {short(card.cutOff)}</span>
                      <span className="num">−{money(card.paidSince)}</span>
                    </li>
                  )}
                  {card.paidSince > 0 && (
                    <li
                      className="bill-receipt-sum"
                      aria-label={`Left to pay, ${money(card.left)}`}
                    >
                      <span>Left to pay</span>
                      <span className="num">{money(card.left)}</span>
                    </li>
                  )}
                  {statement && (
                    <>
                      <li className="bill-receipt-rule" aria-hidden="true" />
                      <li
                        className="bill-receipt-row"
                        aria-label={`Bank statement, ${money(statement.total)}, ${gap === 0 ? 'match ✓' : gap! > 0 ? `${money(gap!)} missing` : `${money(-gap!)} over`}`}
                      >
                        <span className="min-w-0 flex-1">Bank statement</span>
                        <span className="num shrink-0 font-bold">{money(statement.total)}</span>
                        <Tag tone={gap === 0 ? 'ok' : 'pink'}>
                          {gap === 0
                            ? 'match ✓'
                            : gap! > 0
                              ? `+${money(gap!)} missing`
                              : `${money(-gap!)} over`}
                        </Tag>
                      </li>
                      {statement.minimum !== null && (
                        <li
                          className="bill-receipt-row"
                          aria-label={`Minimum payment, ${money(statement.minimum)}`}
                        >
                          <span className="min-w-0 flex-1">Minimum payment</span>
                          <span className="num shrink-0 font-bold">{money(statement.minimum)}</span>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </div>
            </div>
            {gap === 0 && (
              <p className="sr-only" role="status">
                Matches statement ✓
              </p>
            )}

            {/* Everything under the receipt, evenly apart and clear of its torn edge. */}
            <div className="mt-6 flex flex-col gap-4">
              {extra > 0 && (
                <Callout
                  tag={<Tag tone="ok">credit</Tag>}
                  title={`+${money(extra)} paid extra`}
                  label="Paid extra"
                >
                  You paid more than this bill, so it counts toward your {nextBillName(card)} bill.
                  This happens when a line is removed after you paid it, like an interest the bank
                  waived. Nothing to do.
                </Callout>
              )}
              {min?.kind === 'minimum' && (
                <Callout
                  tag={<Tag tone="warn">min paid ✓</Tag>}
                  title={`${money(min.carries)} carries to the ${nextBillName(card)} bill`}
                  label="Minimum paid"
                >
                  Minimum paid ✓ · the bank will likely charge interest on what carries over.
                </Callout>
              )}
              {min?.kind === 'below' && (
                <Callout
                  tag={<Tag tone="pink">below min</Tag>}
                  title={`${money(min.short)} short of the ${money(statement!.minimum!)} minimum`}
                  label="Below minimum"
                >
                  Below minimum ⚠ · a late fee is likely. Pay at least the rest of the minimum.
                </Callout>
              )}
              {gap !== null && gap > 0 && (
                <Callout
                  tag={<Tag tone="pink">check</Tag>}
                  title={`${money(gap)} on the statement is not in the app`}
                  label="Statement gap"
                >
                  Something is not logged yet: a spend, the interest, or a fee.
                  <span className="mt-3 flex flex-wrap gap-2">
                    <Button rounded tonal small className="!w-auto" onClick={logMissing}>
                      Log missing spending
                    </Button>
                    {sources.length > 0 && (
                      <Button
                        rounded
                        tonal
                        small
                        className="!w-auto"
                        onClick={() => setLogging(true)}
                      >
                        Log interest
                      </Button>
                    )}
                  </span>
                </Callout>
              )}
              {gap !== null && gap < 0 && (
                <Callout
                  tag={<Tag tone="pink">check</Tag>}
                  title={`The app has ${money(-gap)} more than the statement`}
                  label="Statement gap"
                >
                  Check the lines on the bill: a wrong amount, a refund not logged yet, or a spend
                  the bank puts on the next bill.
                </Callout>
              )}
              {card.spentSince > 0 && (
                <p className="text-[15px] text-muted">
                  {money(card.spentSince)} spent since then goes on the next bill.
                </p>
              )}
              {card.left > 0 && (
                <Button large rounded onClick={() => setPaying(true)}>
                  I paid it
                </Button>
              )}
              <Button large rounded tonal onClick={() => setLogging(true)}>
                {statement ? 'Edit statement' : 'Enter statement'}
              </Button>
            </div>
            {paying && (
              <PayCardSheet
                card={account}
                left={card.left}
                minimum={
                  statement?.minimum ? Math.max(0, statement.minimum - card.paidSince) : null
                }
                today={data.today}
                onClose={() => setPaying(false)}
              />
            )}
            <EntrySheet
              key={`entry:${entry?.id ?? 'none'}`}
              entry={entry}
              onClose={() => setEntry(null)}
            />
            <PlanSheet
              plan={plans?.find(p => p.id === planId) ?? null}
              account={account}
              onClose={() => setPlanId(null)}
            />
            {logging && (
              <StatementSheet
                account={account}
                card={card}
                statement={statement}
                sources={sources}
                onClose={() => setLogging(false)}
              />
            )}
            <LogSheet
              key={missing?.key ?? 'none'}
              item={missing}
              onClose={() => setMissing(null)}
              onSave={saveMissing}
            />
          </>
        )
      )}
    </section>
  );
}
