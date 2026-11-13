// Under a lifted credit card / pay later account: its last statement. What is left to pay and by when, what was
// billed, and what was spent since (that goes on the next bill). "I paid it" logs the transfer into the card.
import { useQuery } from '@tanstack/react-query';
import { Button } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { dueWords, recurringQueries } from '../../models/recurring';
import type { Account } from '../../models/workspace';
import { dateText } from '../../ui/Fields';
import { PayCardSheet } from './PayCardSheet';

export function CardStatement({
  account,
}: {
  account: Pick<Account, 'id' | 'name' | 'currency_code' | 'statement_day'>;
}) {
  const { data } = useQuery(recurringQueries.list());
  const [paying, setPaying] = useState(false);
  const card = data?.cards.find(c => c.accountId === account.id);
  const money = (n: number) => formatMoney(n, account.currency_code);

  return (
    <section className="mt-5" aria-label="Card bill">
      <div className="mb-2 flex">
        <h3 className="section-title text-[17px] tracking-[-0.02em]">Card bill</h3>
      </div>
      {!account.statement_day ? (
        <p className="text-[15px] text-muted">
          Set this card's statement day (Settings, then the account) to see its bill here.
        </p>
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
