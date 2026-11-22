// Under a lifted credit card / pay later account: its one bill, the way the bank prints it. The lines (unpaid
// from the bill before, spending, each plan's slice, interest), what was paid since and what is left by when,
// and what was spent since (that goes on the next bill). "I paid it" logs a transfer into the card, any amount
// (a short payment carries over). "Log interest" types the bank's interest from the statement, tagged by where
// it came from. A card made before limits and bill days were required gets a key that opens its settings.
import { useQuery } from '@tanstack/react-query';
import { Button } from 'konsta/react';
import { useState } from 'react';
import { EditAccountSheet } from '../accounts/EditAccountSheet';
import { usePlans } from '../installments/plans';
import { formatMoney } from '../../lib/format';
import { catalog } from '../../lib/state';
import {
  billMonth,
  dueWords,
  recurringQueries,
  type CardStatement as Card,
} from '../../models/recurring';
import type { Account } from '../../models/workspace';
import { dateText } from '../../ui/Fields';
import { LogInterestSheet, type InterestSource } from './LogInterestSheet';
import { PayCardSheet } from './PayCardSheet';

type Line = { key: string; label: string; amount: number; paid?: boolean };

/** The bill's lines, in the bank's order. */
function linesOf(card: Card): Line[] {
  const { carry, spent, slices, interest } = card.lines;
  const before = card.before ? billMonth(card.before) : 'last bill';
  return [
    ...(carry > 0 ? [{ key: 'carry', label: `Unpaid from ${before}`, amount: carry }] : []),
    ...(carry < 0 ? [{ key: 'carry', label: `Paid extra on ${before}`, amount: carry }] : []),
    ...(spent ? [{ key: 'spent', label: 'Spending', amount: spent }] : []),
    ...slices.map(s => ({
      key: `slice:${s.planId}:${s.no}`,
      label: `${s.name} ${s.no}/${s.of}`,
      amount: s.amount,
      paid: s.paid,
    })),
    ...interest.map(i => ({
      key: `interest:${i.entryId}`,
      label: i.from
        ? `Interest · on unpaid ${billMonth(i.from)}`
        : `Interest${i.planName ? ` · ${i.planName}${i.no ? ` slice ${i.no}` : ''}` : ''}`,
      amount: i.amount,
    })),
  ];
}

export function CardStatement({
  account,
}: {
  account: Pick<
    Account,
    'id' | 'name' | 'currency_code' | 'statement_day' | 'due_day' | 'credit_limit'
  >;
}) {
  const { data } = useQuery(recurringQueries.list());
  const plans = usePlans(account.id);
  const [paying, setPaying] = useState(false);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const setUp = Boolean(account.statement_day && account.due_day && account.credit_limit);
  const card = data?.cards.find(c => c.accountId === account.id);
  const money = (n: number) => formatMoney(n, account.currency_code);
  // Interest can come from what was left unpaid of the bill before, or a plan with a slice still unpaid. Never
  // on a card's first bill: nothing was unpaid before it.
  const sources: InterestSource[] = card?.before
    ? [
        ...(card.lines.carry > 0
          ? [
              {
                key: `m:${card.before}`,
                label: `On unpaid ${billMonth(card.before)}`,
                from: { month: card.before },
              },
            ]
          : []),
        ...(plans ?? [])
          .filter(p => p.next)
          .map(p => ({ key: `p:${p.id}`, label: p.name, from: { planId: p.id } })),
      ]
    : [];

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
            <ul className="panel mt-3 bg-white px-3.5 py-1 dark:bg-raised" aria-label="Bill lines">
              {linesOf(card).map(l => (
                <li
                  key={l.key}
                  className="flex items-baseline justify-between gap-3 border-b border-edge py-2 text-[15px] last:border-b-0"
                >
                  <span className="min-w-0 truncate">
                    {l.label}
                    {l.paid && (
                      <span className="ml-1.5 text-[12px] font-bold text-primary">PAID</span>
                    )}
                  </span>
                  <span className="num shrink-0 font-semibold">{money(l.amount)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 py-2 text-[15px] font-bold">
                <span>Bill</span>
                <span className="num">{money(card.bill)}</span>
              </li>
              {card.paidSince > 0 && (
                <li className="flex items-baseline justify-between gap-3 border-t border-edge py-2 text-[15px] text-muted">
                  <span>Paid since</span>
                  <span className="num">−{money(card.paidSince)}</span>
                </li>
              )}
            </ul>
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
            {sources.length > 0 && (
              <Button large rounded tonal className="mt-2" onClick={() => setLogging(true)}>
                Log interest
              </Button>
            )}
            {paying && (
              <PayCardSheet
                card={account}
                left={card.left}
                today={data.today}
                onClose={() => setPaying(false)}
              />
            )}
            {logging && (
              <LogInterestSheet
                card={account}
                closedOn={card.cutOff}
                sources={sources}
                onClose={() => setLogging(false)}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
