// Add or change one recurring bill: its name (known services are offered while typing), amount (or "varies"),
// where it is paid from, category, how often and when. An existing bill can be marked paid (logs the expense
// and moves it on), paused or removed. The form's state and rules are models/recurringForm; this only renders them.
import { Block, Button } from 'konsta/react';
import { useId, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { active, catalog, everyday } from '../../lib/state';
import { persist } from '../../models/query';
import { recurringApi, recurringQueries, type Recurring } from '../../models/recurring';
import {
  formFrom,
  REPEATS,
  toEvery,
  toRequest,
  validate,
  type Prefill,
  type RecurringForm,
} from '../../models/recurringForm';
import { AmountField } from '../../ui/AmountField';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { DateRow, InputRow, PickerRow, ToggleRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { serviceNamed, SERVICES } from './services';

export function RecurringSheet({
  item,
  prefill,
  today,
  onClose,
}: {
  /** null = a new bill. */
  item: Recurring | null;
  prefill?: Prefill;
  today: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RecurringForm>(() => formFrom(item, today, prefill));
  const set = (patch: Partial<RecurringForm>) => setForm(f => ({ ...f, ...patch }));
  // What Mark paid logs: the bill's amount, or what was typed for one that varies.
  const [paying, setPaying] = useState<number | null>(item?.amount ?? null);
  const [confirm, setConfirm] = useState(false);
  const services = useId();

  const cat = catalog.value;
  const account = cat.accounts.find(a => a.id === form.accountId);
  const currency = account?.currency_code ?? 'IDR';
  const pockets = active(cat.envelopes).filter(e => e.account_id === form.accountId);
  const error = validate(form);

  // A known service also brings its category (unless one is picked) and whether its amount varies.
  const rename = (name: string) => {
    const s = serviceNamed(name);
    const category = s && cat.categories.find(c => c.name === s.category && !c.archived_at);
    set({
      name,
      service: s?.key ?? null,
      ...(category && !form.categoryId ? { categoryId: category.id } : {}),
      ...(s?.varies ? { varies: true } : {}),
    });
  };
  const done = async (save: () => Promise<unknown>, said: string, everything = false) => {
    if (!(await persist(save, everything ? undefined : [recurringQueries.all()]))) return;
    onClose();
    showToast(said);
  };
  const save = () =>
    done(
      () =>
        item ? recurringApi.update(item.id, toRequest(form)) : recurringApi.create(toRequest(form)),
      'Bill saved',
    );

  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={item ? item.name : 'Add a bill'}>
        <Group>
          <InputRow
            label="Name"
            value={form.name}
            placeholder="Netflix, rent…"
            list={services}
            onInput={rename}
          />
          <ToggleRow
            label="Amount varies"
            checked={form.varies}
            onChange={v => set({ varies: v })}
          />
          {!form.varies && (
            <AmountField
              label="Amount each time"
              value={form.amount}
              currency={currency}
              onChange={v => set({ amount: v })}
            />
          )}
          <PickerRow
            label="Paid from"
            value={form.accountId}
            options={everyday().map(a => ({ value: a.id, label: a.name }))}
            onChange={v => set({ accountId: v, envelopeId: null })}
          />
          {pockets.length > 1 && (
            <PickerRow
              label="Pocket"
              value={form.envelopeId}
              placeholder="Main"
              options={pockets
                .filter(e => e.id !== account?.default_envelope_id)
                .map(e => ({ value: e.id, label: e.name }))}
              onChange={v => set({ envelopeId: v })}
            />
          )}
          <PickerRow
            label="Category"
            value={form.categoryId}
            options={active(cat.categories)
              .filter(c => c.kind === 'EXPENSE')
              .map(c => ({ value: c.id, label: c.name }))}
            onChange={v => set({ categoryId: v })}
          />
          <PickerRow
            label="Repeats"
            value={String(form.everyMonths)}
            options={REPEATS.map(r => ({ value: String(r.value), label: r.label }))}
            onChange={v => v && set({ everyMonths: toEvery(Number(v)) })}
          />
          <DateRow label="Next due" value={form.nextDue} onChange={v => set({ nextDue: v })} />
          <DateRow
            label="Ends on"
            value={form.endsOn}
            onChange={v => set({ endsOn: v })}
            optional
          />
        </Group>
        <datalist id={services}>
          {SERVICES.map(s => (
            <option key={s.key} value={s.name} />
          ))}
        </datalist>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={Boolean(error)} onClick={save}>
            {error ?? 'Save'}
          </Button>
        </Block>
        {item && (
          <>
            <Group
              label="Paid it?"
              foot="Logs it as an expense today and moves the bill to its next due date."
            >
              <AmountField
                label="Paid this time"
                value={paying}
                currency={item.currency}
                onChange={setPaying}
              />
            </Group>
            <Block className="flex flex-col gap-2.5">
              <Button
                large
                rounded
                disabled={!paying}
                onClick={() =>
                  done(
                    () => recurringApi.paid(item.id, { amount: paying ?? undefined }),
                    `${item.name} logged`,
                    true,
                  )
                }
              >
                {paying ? `Mark paid ${formatMoney(paying, item.currency)}` : 'Enter what you paid'}
              </Button>
              <Button
                large
                rounded
                tonal
                onClick={() =>
                  done(
                    () => recurringApi.update(item.id, { paused: !item.paused }),
                    item.paused ? 'Bill resumed' : 'Bill paused',
                  )
                }
              >
                {item.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                large
                rounded
                tonal
                className="k-color-brand-red"
                onClick={() => setConfirm(true)}
              >
                Remove bill
              </Button>
            </Block>
          </>
        )}
      </Sheet>
      <ConfirmSheet
        open={confirm}
        message={`Remove ${item?.name ?? 'this bill'}? Your entries stay.`}
        confirmLabel="Remove"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (item) void done(() => recurringApi.remove(item.id), 'Bill removed');
        }}
      />
    </>
  );
}
