// Under a lifted credit card / pay later account: its last statement. What is left to pay and by when, what was
// billed, and what was spent since (that goes on the next bill). "I paid it" logs the transfer into the card.
// A card made before limits and bill days were required gets a key that opens its settings instead.
import { useQuery } from '@tanstack/react-query';
import { Button } from 'konsta/react';
import { useState } from 'react';
import { EditAccountSheet } from '../accounts/EditAccountSheet';
import { formatMoney } from '../../lib/format';
import { catalog } from '../../lib/state';
import { dueWords, recurringQueries } from '../../models/recurring';
import type { Account } from '../../models/workspace';
import { dateText } from '../../ui/Fields';
import { PayCardSheet } from './PayCardSheet';

export function CardStatement({
  account,
}: {
  account: Pick<
    Account,
    'id' | 'name' | 'currency_code' | 'statement_day' | 'due_day' | 'credit_limit'
  >;
}) {
  const { data } = useQuery(recurringQueries.list());
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const setUp = Boolean(account.statement_day && account.due_day && account.credit_limit);
  const card = data?.cards.find(c => c.accountId === account.id);
  const money = (n: number) => formatMoney(n, account.currency_code);

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
                ? `Nothing left to pay of the ${money(card.bill)} billed on ${dateText(card.cutOff)}.`
                : `Left of ${money(card.bill)} billed on ${dateText(card.cutOff)}.${card.dueOn ? ` ${dueWords(card.dueOn, data.today)}.` : ''}`}
            </p>
            {card.spentSince > 0 && (
              <p className="text-[15px] text-muted">
                {money(card.spentSince)} spent since then goes on the next bill.
              </p>
            )}
            {card.left > 0 && (
              <Button large rounded className="mt-3" onClick={() => setPaying(true)}>
                I paid it
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
          </>
        )
      )}
    </section>
  );
}
