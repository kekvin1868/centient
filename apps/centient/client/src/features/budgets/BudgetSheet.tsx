// Set, change or remove a monthly budget for a category, a pocket, or both, in one currency: a pocket's own, or
// for a category alone the one picked (rupiah unless changed). The switch makes it a temporary budget: a start
// day and a length, one limit for the whole run. A clash with another temporary one shows in a warning popup.
// The form's state and rules are models/budget (formFrom, validate, toRequest); this only renders them.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { pocketLabel } from '../../lib/labels';
import { errorText } from '../../lib/run';
import { active, catalog, me } from '../../lib/state';
import {
  formCurrency,
  formFrom,
  TEMPORARY_DAYS,
  toRequest,
  useRemoveBudget,
  useSaveBudget,
  validate,
  type Budget,
  type BudgetForm,
} from '../../models/budget';
import { addDays } from '../../models/dates';
import { monthDay } from '../../models/forecast';
import { AmountField } from '../../ui/AmountField';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { CurrencyPicker } from '../../ui/CurrencyPicker';
import { DateRow, PickerRow, ToggleRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { NoticeSheet } from '../../ui/NoticeSheet';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

const DAYS = Array.from({ length: TEMPORARY_DAYS.max - TEMPORARY_DAYS.min + 1 }, (_, i) => {
  const d = String(i + TEMPORARY_DAYS.min);
  return { value: d, label: `${d} days` };
});

export function BudgetSheet({
  budget,
  onClose,
}: {
  budget: Budget | 'new' | null;
  onClose: () => void;
}) {
  const initial = budget === 'new' ? null : budget;
  const today = me.value?.today ?? new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<BudgetForm>(() => formFrom(initial, today));
  const set = (patch: Partial<BudgetForm>) => setForm(f => ({ ...f, ...patch }));
  // Popups over the sheet: removing asks first; an overlapping temporary budget is explained.
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const saveBudget = useSaveBudget(e =>
    e.code === 'BUDGET_OVERLAP' ? setNotice(e.message) : showToast(errorText(e)),
  );
  const removeBudget = useRemoveBudget();
  if (!budget) return null;

  const cat = catalog.value;
  const editing = initial !== null;
  const pocketCurrency = cat.envelopes.find(e => e.id === form.envelopeId)?.currency_code;
  const currency = formCurrency(form, editing, pocketCurrency);
  const error = validate(form, { editing, today });
  const busy = saveBudget.isPending || removeBudget.isPending;

  const save = () => {
    if (error) return;
    saveBudget.mutate(toRequest(form, currency, initial?.id), {
      onSuccess: () => {
        onClose();
        showToast('Budget saved');
      },
    });
  };
  const remove = () => {
    setConfirm(false);
    if (!initial) return;
    removeBudget.mutate(initial.id, {
      onSuccess: () => {
        onClose();
        showToast('Budget removed');
      },
    });
  };

  const categories = active(cat.categories)
    .filter(c => c.kind === 'EXPENSE')
    .map(c => ({ value: c.id, label: c.name }));
  const pockets = active(cat.envelopes)
    .filter(
      e => e.kind === 'SPENDING' && cat.accounts.find(x => x.id === e.account_id)?.kind !== 'IOU',
    )
    .map(e => ({ value: e.id, label: pocketLabel(e.id) }));

  return (
    <>
      <Sheet
        open={!confirm && notice === null}
        onClose={onClose}
        title={editing ? 'Budget' : 'Set a budget'}
      >
        <Group
          foot={
            form.temporary
              ? `Ends ${monthDay(addDays(form.startsOn, form.days))} at 00:00. Spending in these days still counts toward a monthly budget too.`
              : 'A new limit counts from this month on; past months keep theirs.'
          }
        >
          <PickerRow
            label="Category"
            value={form.categoryId}
            placeholder="Any category"
            options={categories}
            onChange={v => !editing && set({ categoryId: v })}
          />
          <PickerRow
            label="Pocket"
            value={form.envelopeId}
            placeholder="Any pocket"
            options={pockets}
            onChange={v => !editing && set({ envelopeId: v })}
          />
          {editing || pocketCurrency ? (
            <Row title="Currency" trail={currency} />
          ) : (
            <CurrencyPicker value={form.currency} onChange={v => set({ currency: v })} />
          )}
          {!editing && (
            <ToggleRow
              label="Temporary"
              checked={form.temporary}
              onChange={v => set({ temporary: v })}
            />
          )}
          {form.temporary &&
            (editing ? (
              <>
                <Row title="Starts" trail={monthDay(form.startsOn)} />
                <Row title="Lasts" trail={`${form.days} days`} />
              </>
            ) : (
              <>
                <DateRow
                  label="Starts"
                  value={form.startsOn}
                  onChange={v => set({ startsOn: v })}
                />
                <PickerRow
                  label="Lasts"
                  value={String(form.days)}
                  options={DAYS}
                  onChange={v => v && set({ days: Number(v) })}
                />
              </>
            ))}
          <AmountField
            label={form.temporary ? `Limit for these ${form.days} days` : 'Limit per month'}
            value={form.limit}
            currency={currency}
            onChange={v => set({ limit: v })}
          />
        </Group>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={Boolean(error) || busy} onClick={save}>
            {error ?? 'Save'}
          </Button>
          {editing && (
            <Button
              large
              rounded
              tonal
              className="k-color-brand-red"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Remove budget
            </Button>
          )}
        </Block>
      </Sheet>
      <NoticeSheet message={notice} onClose={() => setNotice(null)} />
      <ConfirmSheet
        open={confirm}
        message="Remove this budget? Your entries stay."
        confirmLabel="Remove"
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </>
  );
}
