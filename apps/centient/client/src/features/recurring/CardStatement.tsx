// Under a lifted credit card / pay later account: its one bill, the way the bank prints it. The lines (unpaid
// from the bill before, spending, each plan's slice, interest), what was paid since and what is left by when,
// and what was spent since (that goes on the next bill). "I paid it" logs a transfer into the card, any amount
// (a short payment carries over; Full / Minimum once the minimum is typed). "Enter statement" types what the bank's
// statement says (total, minimum, interest); the bill then shows whether it matches, and if not, what to do: the
// bank asks more = log the missing spending or the interest; the app has more = check its lines. An installment
// line opens its plan, an interest line its entry (to fix or delete it). A card made before limits and bill days
// were required gets a key that opens its settings.
import { useQuery } from '@tanstack/react-query';
import { cardSetUp } from '../../../../src/domain/recurring';
import { Button } from 'konsta/react';
import { useState } from 'react';
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
  recurringQueries,
  statementGap,
  statementOf,
} from '../../models/recurring';
import { dayWords } from '../../models/dates';
import { outboxItems } from '../../models/outbox';
import { blankForm, toCommand, type LogItem } from '../entries/form';
import { LogSheet } from '../entries/LogSheet';
import { showToast } from '../../ui/Toast';
import type { Account } from '../../../../src/repos/accounts';
import { dateText } from '../../ui/Fields';
import { StatementSheet } from './StatementSheet';
import { PayCardSheet } from './PayCardSheet';

export function CardStatement({ account }: { account: Account }) {
  const { data } = useQuery(recurringQueries.list());
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
            {min?.kind === 'minimum' && (
              <p className="mt-1 text-[15px]" role="status">
                Minimum paid ✓ · {money(min.carries)} carries to the {nextBillName(card)} bill · the
                bank will likely charge interest on it
              </p>
            )}
            {min?.kind === 'below' && (
              <p className="mt-1 text-[15px] text-negative" role="status">
                Below minimum ⚠ {money(min.short)} short of {money(statement!.minimum!)} · late fee
                likely
              </p>
            )}
            <ul className="panel mt-3 bg-white px-3.5 py-1 dark:bg-raised" aria-label="Bill lines">
              {billLines(card).map(l => {
                const body = (
                  <>
                    <span className="min-w-0 truncate">
                      {l.label}
                      {l.paid && (
                        <span className="ml-1.5 text-[12px] font-bold text-primary">PAID</span>
                      )}
                    </span>
                    <span className="num shrink-0 font-semibold">
                      {money(l.amount)}
                      {(l.planId || l.entryId) && (
                        <span aria-hidden="true" className="ml-1 text-muted">
                          ›
                        </span>
                      )}
                    </span>
                  </>
                );
                const row = 'flex items-baseline justify-between gap-3 py-2 text-[15px]';
                const open = l.planId
                  ? () => setPlanId(l.planId!)
                  : l.entryId
                    ? () => attempt(async () => setEntry(await entryApi.get(l.entryId!)))
                    : null;
                return (
                  <li key={l.key} className="border-b border-edge last:border-b-0">
                    {open ? (
                      <button
                        type="button"
                        className={`${row} w-full text-left active:opacity-60`}
                        onClick={open}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={row}>{body}</div>
                    )}
                  </li>
                );
              })}
              <li className="flex items-baseline justify-between gap-3 py-2 text-[15px] font-bold">
                <span>Bill</span>
                <span className="num">{money(card.bill)}</span>
              </li>
              {card.paidSince > 0 && (
                <li className="flex items-baseline justify-between gap-3 border-t border-edge py-2 text-[15px] text-muted">
                  <span>
                    Paid since {dayWords(card.cutOff, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="num">−{money(card.paidSince)}</span>
                </li>
              )}
              {card.paidSince > 0 && (
                <li className="flex items-baseline justify-between gap-3 border-t border-edge py-2 text-[15px] font-bold">
                  <span>Left to pay</span>
                  <span className="num">{money(card.left)}</span>
                </li>
              )}
              {statement && (
                <li className="flex items-baseline justify-between gap-3 border-t border-edge py-2 text-[15px] text-muted">
                  <span>
                    Statement says
                    {statement.minimum !== null && ` · minimum ${money(statement.minimum)}`}
                  </span>
                  <span className="num">{money(statement.total)}</span>
                </li>
              )}
            </ul>
            {gap === 0 && (
              <p className="mt-2 text-[15px] font-semibold text-primary" role="status">
                Matches statement ✓
              </p>
            )}
            {gap !== null && gap > 0 && (
              <div className="mt-2" role="status" aria-label="Statement gap">
                <p className="text-[15px] font-semibold text-negative">
                  ⚠ {money(gap)} on the statement is not in the app
                </p>
                <p className="text-[13px] text-muted">
                  Something not logged yet: a spend, the interest, or a fee.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button rounded tonal small onClick={logMissing}>
                    Log missing spending
                  </Button>
                  {sources.length > 0 && (
                    <Button rounded tonal small onClick={() => setLogging(true)}>
                      Log interest
                    </Button>
                  )}
                </div>
              </div>
            )}
            {gap !== null && gap < 0 && (
              <div className="mt-2" role="status" aria-label="Statement gap">
                <p className="text-[15px] font-semibold text-negative">
                  ⚠ The app has {money(-gap)} more than the statement
                </p>
                <p className="text-[13px] text-muted">
                  Check the lines above: a wrong amount, a refund not logged yet, or a spend the
                  bank puts on the next bill.
                </p>
              </div>
            )}
            {card.spentSince > 0 && (
              <p className="mt-2 text-[15px] text-muted">
                {money(card.spentSince)} spent since then goes on the next bill.
              </p>
            )}
            {card.left > 0 && (
              <Button large rounded className="mt-3" onClick={() => setPaying(true)}>
                I paid it
              </Button>
            )}
            <Button large rounded tonal className="mt-2" onClick={() => setLogging(true)}>
              {statement ? 'Edit statement' : 'Enter statement'}
            </Button>
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
