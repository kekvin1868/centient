// Add an account: name, type, what's in it now. A card / pay later asks its limit, the day its bill closes and the
// day it must be paid (all required: without them it has no bill), what is still unpaid on its last bill and what was
// spent since (`cantSave` says what is missing). Currency stays rupiah unless you ask for another.
import { Block, BlockFooter, Button } from 'konsta/react';
import { useState } from 'react';
import { ACCOUNT_KINDS, MONTH_DAYS } from '../../lib/format';
import { AmountField } from '../../ui/AmountField';
import { InputRow, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { CurrencyPicker } from '../../ui/CurrencyPicker';
import { isCard } from '../../../../src/domain/recurring';
import { accountApi, cantSave } from '../../models/account';
import { persist } from '../../models/query';

const KINDS = [
  'BANK',
  'DEBIT_CARD',
  'EWALLET',
  'CASH',
  'CREDIT_CARD',
  'PAYLATER',
  'EXCHANGE',
] as const;
type Kind = (typeof KINDS)[number];

export function AccountForm({
  onDone,
  submitLabel = 'Add account',
}: {
  onDone: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('BANK');
  const [amount, setAmount] = useState<number | null>(null);
  const [billed, setBilled] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [closes, setCloses] = useState<string | null>(null);
  const [payBy, setPayBy] = useState<string | null>(null);
  const [currency, setCurrency] = useState('IDR');
  const [otherCurrency, setOtherCurrency] = useState(false);
  const card = isCard(kind);
  // A card: used = still unpaid on the last bill (on that bill) + spent since (on the next one).
  const used = (billed ?? 0) + (amount ?? 0);
  const missing = cantSave({ name, card, limit, days: [closes, payBy], used });

  const save = async () => {
    const ok = await persist(() =>
      accountApi.create({
        name: name.trim(),
        kind,
        currency,
        ...(card && { creditLimit: limit, statementDay: Number(closes), dueDay: Number(payBy) }),
        ...(card
          ? { openingBalance: used ? -used : undefined, billedBalance: billed || undefined }
          : { openingBalance: amount || undefined }),
      }),
    );
    if (ok) onDone();
  };

  return (
    <>
      <Group>
        <InputRow label="Name" value={name} placeholder="e.g. BCA, GoPay" onInput={setName} />
        <PickerRow
          label="Type"
          value={kind}
          options={KINDS.map(k => ({ value: k, label: ACCOUNT_KINDS[k] }))}
          onChange={v => v && setKind(v as Kind)}
        />
        {(otherCurrency || kind === 'EXCHANGE') && (
          <CurrencyPicker value={currency} onChange={setCurrency} />
        )}
        {card && (
          <>
            <AmountField label="Limit" currency={currency} value={limit} onChange={setLimit} />
            <PickerRow
              label="Bill closes on day"
              value={closes}
              placeholder="Pick"
              options={MONTH_DAYS}
              onChange={setCloses}
            />
            <PickerRow
              label="Pay by day"
              value={payBy}
              placeholder="Pick"
              options={MONTH_DAYS}
              onChange={setPayBy}
            />
            <AmountField
              label="Unpaid on the last bill"
              currency={currency}
              value={billed}
              onChange={setBilled}
            />
          </>
        )}
        <AmountField
          label={card ? 'Spent since the last bill' : 'How much is in it now'}
          currency={currency}
          value={amount}
          onChange={setAmount}
        />
      </Group>
      {card && (
        <BlockFooter inset>
          Both days are on your statement: the day it's printed (tanggal cetak) and the day it's due
          (jatuh tempo). Spending up to the closing day goes on that month's bill. What is still
          unpaid on the last bill stays on it; what you spent since goes on the next one.
        </BlockFooter>
      )}
      <Block className="flex flex-col items-start gap-3 !mt-0">
        {!otherCurrency && kind !== 'EXCHANGE' && (
          <Button clear inline onClick={() => setOtherCurrency(true)}>
            Different currency
          </Button>
        )}
        <Button large rounded disabled={Boolean(missing)} onClick={save}>
          {missing ?? submitLabel}
        </Button>
      </Block>
    </>
  );
}
