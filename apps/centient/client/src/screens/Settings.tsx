// Settings: accounts, Pockets, categories, when the month starts, backup and reset. "Hide" keeps history;
// deleting an account or resetting flags data as deleted rather than erasing it.
import { Block, BlockFooter, Button, ListItem } from 'konsta/react';
import { useState } from 'react';
import type { Account, Category, Envelope } from '../../../src/application/ports';
import { call, client } from '../api';
import { AccountForm } from '../components/AccountForm';
import { AmountField } from '../components/AmountField';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { InputRow, PickerRow, ToggleRow } from '../components/Fields';
import { Group, Row } from '../components/List';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { ACCOUNT_KINDS } from '../lib/format';
import { downloadBackup } from '../lib/backup';
import { categoryEmoji } from '../lib/labels';
import { attempt } from '../lib/run';
import { active, catalog, everyday, me, nameOf, refresh } from '../state';

type Edit = { table: 'accounts'; row: Account } | { table: 'envelopes'; row: Envelope } | { table: 'categories'; row: Category };
const POCKET_KINDS: Record<Envelope['kind'], string> = { SPENDING: 'Spending', SAVINGS: 'Savings', GOAL: 'Goal' };
// Looked up by name by the app (fees, opening balances, corrections); they can't be deleted.
const BUILT_IN = ['Fees', 'Opening balance', 'Balance adjustment'];

export function Settings() {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [add, setAdd] = useState<'account' | 'pocket' | 'category' | null>(null);
  const [reset, setReset] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const cat = catalog.value;
  const hidden = [...cat.accounts, ...cat.envelopes, ...cat.categories].filter(r => r.archived_at).length;

  return (
    <main className="screen">
      <h1 className="screen-title">Settings</h1>

      <Group label="Accounts">
        {active(cat.accounts).map(a => <Row key={a.id} title={a.name} sub={`${ACCOUNT_KINDS[a.kind]}${a.currency_code !== 'IDR' ? ` · ${a.currency_code}` : ''}`} chevron onClick={() => setEdit({ table: 'accounts', row: a })} />)}
        <Row title={<span className="text-primary">Add account</span>} onClick={() => setAdd('account')} />
      </Group>

      <Group label="Pockets" foot="Pockets live inside an account and set some of its money aside. Each account has a Main pocket where new money lands; move money between pockets on the Money tab.">
        {active(cat.envelopes).filter(e => !cat.accounts.some(a => a.default_envelope_id === e.id)).map(e => (
          <Row key={e.id} title={e.name} sub={`${nameOf(cat.accounts, e.account_id)} · ${POCKET_KINDS[e.kind]}`} chevron onClick={() => setEdit({ table: 'envelopes', row: e })} />
        ))}
        <Row title={<span className="text-primary">Add pocket</span>} onClick={() => setAdd('pocket')} />
      </Group>

      <Group label="Categories">
        {active(cat.categories).filter(c => !['Balance adjustment', 'Opening balance'].includes(c.name)).map(c => (
          <Row key={c.id} title={`${categoryEmoji(c.name, c.kind)} ${c.name}`} sub={c.kind === 'EXPENSE' ? 'Spending' : 'Income'} chevron onClick={() => setEdit({ table: 'categories', row: c })} />
        ))}
        <Row title={<span className="text-primary">Add category</span>} onClick={() => setAdd('category')} />
      </Group>

      {hidden > 0 && (
        <Group label="Hidden">
          <ListItem link linkComponent="button" chevron={false} linkProps={{ type: 'button', onClick: () => setShowHidden(!showHidden), 'aria-expanded': showHidden }}
            title={<span className="text-primary">{showHidden ? 'Hide the list' : `Show ${hidden} hidden item${hidden === 1 ? '' : 's'}`}</span>} />
          {showHidden && (<>
            {cat.accounts.filter(a => a.archived_at).map(a => <Row key={a.id} title={a.name} sub="Account" trail={<ShowButton table="accounts" id={a.id} />} />)}
            {cat.envelopes.filter(e => e.archived_at).map(e => <Row key={e.id} title={e.name} sub="Pocket" trail={<ShowButton table="envelopes" id={e.id} />} />)}
            {cat.categories.filter(c => c.archived_at).map(c => <Row key={c.id} title={c.name} sub="Category" trail={<ShowButton table="categories" id={c.id} />} />)}
          </>)}
        </Group>
      )}

      <MonthStart />

      <Group label="Your data">
        <Row title="Download all as spreadsheet (CSV)" chevron onClick={() => location.assign('/api/export.csv')} />
        <Row title="Download a backup" sub="Everything, as one file you can keep" chevron onClick={() => attempt(downloadBackup)} />
      </Group>

      <Group>
        <Row title={<span className="k-color-brand-red font-semibold text-primary">Reset Centient</span>} onClick={() => setReset(true)} />
      </Group>
      <ResetSheet open={reset} onClose={() => setReset(false)} />

      <EditSheet key={edit ? `${edit.table}:${edit.row.id}` : 'none'} edit={edit} onClose={() => setEdit(null)} />
      <Sheet open={add === 'account'} onClose={() => setAdd(null)} title="Add account"><AccountForm onDone={() => setAdd(null)} /></Sheet>
      <AddPocket open={add === 'pocket'} onClose={() => setAdd(null)} />
      <AddCategory open={add === 'category'} onClose={() => setAdd(null)} />
    </main>
  );
}

function ShowButton({ table, id }: { table: Edit['table']; id: string }) {
  return (
    <Button clear inline small onClick={() => attempt(async () => {
      await call(client.api[':table{accounts|envelopes|categories}'][':id'].$patch({ param: { table, id }, json: { archived: false } }));
      await refresh();
    })}>Show</Button>
  );
}

function MonthStart() {
  const day = me.value?.workspace.cycle_start_day ?? 1;
  return (
    <Group label="Budgets" foot="Pick the day your salary usually arrives, so each month runs payday to payday.">
      <PickerRow label="Month starts on day" value={String(day)} placeholder="1"
        options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        onChange={v => attempt(async () => {
          await call(client.api.workspace.$patch({ json: { cycle_start_day: Number(v ?? 1) } }));
          await refresh();
          showToast('Saved');
        })} />
    </Group>
  );
}

function EditSheet({ edit, onClose }: { edit: Edit | null; onClose: () => void }) {
  const acc = edit?.table === 'accounts' ? edit.row : null;
  const env = edit?.table === 'envelopes' ? edit.row : null;
  const [name, setName] = useState(edit?.row.name ?? '');
  const [defaultPocket, setDefaultPocket] = useState<string | null>(acc?.default_envelope_id ?? null);
  const [currency, setCurrency] = useState(acc?.currency_code ?? 'IDR');
  const [target, setTarget] = useState<number | null>(env?.target_amount ?? null);
  const [targetDate, setTargetDate] = useState(env?.target_date ?? '');
  const [kind, setKind] = useState(acc?.kind ?? 'BANK');
  const [dueDay, setDueDay] = useState<string | null>(acc?.due_day ? String(acc.due_day) : null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!edit) return null;
  const cat = catalog.value;
  const patch = (json: Record<string, unknown>, done: string) => attempt(async () => {
    await call(client.api[':table{accounts|envelopes|categories}'][':id'].$patch({ param: { table: edit.table, id: edit.row.id }, json }));
    await refresh();
    onClose();
    showToast(done);
  });
  const save = () => {
    const json: Record<string, unknown> = { name: name.trim() };
    if (edit.table === 'accounts') {
      json.default_envelope_id = defaultPocket;
      if (currency !== edit.row.currency_code) json.currency_code = currency;
      if (kind !== edit.row.kind) json.kind = kind;
      json.due_day = billed ? (dueDay ? Number(dueDay) : null) : null;
    }
    if (edit.table === 'envelopes' && edit.row.kind === 'GOAL') { json.target_amount = target; json.target_date = targetDate || null; }
    return patch(json, 'Saved');
  };
  const what = edit.table === 'accounts' ? 'account' : edit.table === 'envelopes' ? 'Pocket' : 'category';
  const billed = kind === 'CREDIT_CARD' || kind === 'PAYLATER';
  const askDelete = () => attempt(async () => {
    const page = await call(client.api.entries.$get({ query: { limit: '200', account: edit.row.id } }));
    const n = page.items.length;
    setConfirmDelete(n === 0 ? `Delete ${edit.row.name}? It has no entries.`
      : `Delete ${edit.row.name} and its ${page.nextCursor ? `${n}+` : n} entr${n === 1 ? 'y' : 'ies'}? Balances and Pockets update to match.`);
  });
  const remove = () => attempt(async () => {
    setConfirmDelete(null);
    await call(client.api.accounts[':id'].$delete({ param: { id: edit.row.id } }));
    await refresh();
    onClose();
    showToast('Account deleted');
  });

  return (
    <>
    <Sheet open={!confirmDelete && !deleting} onClose={onClose} title={edit.row.name}>
      <Group>
        <InputRow label="Name" value={name} onInput={setName} />
        {edit.table === 'accounts' && (
          <>
            {edit.row.kind !== 'IOU' && (
              <PickerRow label="Type" value={kind} onChange={v => v && setKind(v)}
                options={Object.entries(ACCOUNT_KINDS).filter(([k]) => k !== 'IOU').map(([value, label]) => ({ value, label }))} />
            )}
            {billed && (
              <PickerRow label="Bill due on day" value={dueDay} placeholder="Not set" onChange={setDueDay}
                options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
            )}
            {edit.row.kind !== 'IOU' && (
              <PickerRow label="New money goes to" value={defaultPocket} placeholder="Main"
                options={active(cat.envelopes).filter(e => e.account_id === edit.row.id).map(e => ({ value: e.id, label: e.name }))} onChange={v => v && setDefaultPocket(v)} />
            )}
            <PickerRow label="Currency" value={currency} options={Object.keys(me.value?.currencies ?? {}).map(c => ({ value: c, label: c }))} onChange={v => v && setCurrency(v)} />
          </>
        )}
        {edit.table === 'envelopes' && edit.row.kind === 'GOAL' && (
          <>
            <AmountField label="Goal" value={target} currency={edit.row.currency_code} onChange={setTarget} />
            <InputRow label="By" type="date" value={targetDate} onInput={setTargetDate} />
          </>
        )}
      </Group>
      {edit.table === 'accounts' && <BlockFooter inset>Currency can change only before the account has entries.</BlockFooter>}
      <Block className="flex flex-col gap-2.5">
        <Button large rounded disabled={!name.trim()} onClick={save}>Save</Button>
        <Button large rounded tonal onClick={() => patch({ archived: true }, `Hidden. Find it under Hidden to show it again.`)}>Hide this {what}</Button>
        {edit.table === 'accounts' && <Button large rounded tonal className="k-color-brand-red" onClick={askDelete}>Delete account</Button>}
        {edit.table === 'categories' && !BUILT_IN.includes(edit.row.name) && (
          <Button large rounded tonal className="k-color-brand-red" onClick={() => setDeleting(true)}>Delete category</Button>
        )}
      </Block>
    </Sheet>
    <ConfirmSheet open={Boolean(confirmDelete)} message={confirmDelete ?? ''} confirmLabel="Delete account"
      onCancel={() => setConfirmDelete(null)} onConfirm={remove} />
    {deleting && edit.table === 'categories' && <DeleteCategorySheet category={edit.row} onClose={() => setDeleting(false)} onDeleted={onClose} />}
    </>
  );
}

/** Start over. Optionally downloads a backup first; the old data stays on the server, flagged as deleted. */
function ResetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      if (backup) await downloadBackup();
      await call(client.api.workspace.reset.$post());
    });
    setBusy(false);
    // A clean start: reload so every screen and cache begins from the fresh workspace.
    if (ok) location.assign('/');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Reset Centient">
      <p className="mx-4 my-4 text-muted">
        This removes your accounts, entries, Pockets, categories and budgets from the app, and you start again from the first screen.
        A copy stays on the server, marked as deleted.
      </p>
      <Group>
        <ToggleRow label="Download a backup first" checked={backup} onChange={setBackup} />
      </Group>
      <Block className="flex flex-col gap-2.5">
        <Button large rounded className="k-color-brand-red" disabled={busy} onClick={run}>{busy ? 'Resetting…' : 'Reset Centient'}</Button>
        <Button large rounded tonal onClick={onClose}>Cancel</Button>
      </Block>
    </Sheet>
  );
}

function AddPocket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const holders = everyday();
  const [accountId, setAccountId] = useState<string | null>(holders[0]?.id ?? null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Envelope['kind']>('SAVINGS');
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const currency = holders.find(a => a.id === accountId)?.currency_code ?? 'IDR';
  const error = !accountId ? 'Pick an account' : !name.trim() ? 'Enter a name' : kind === 'GOAL' && !target ? 'Enter the goal amount' : null;
  const save = () => attempt(async () => {
    await call(client.api.envelopes.$post({ json: { accountId: accountId!, name: name.trim(), kind, targetAmount: kind === 'GOAL' ? target : null, targetDate: kind === 'GOAL' && date ? date : null } }));
    await refresh();
    setName(''); setTarget(null); setDate('');
    onClose();
  });
  return (
    <Sheet open={open} onClose={onClose} title="Add pocket">
      <Segmented label="Kind" value={kind} onChange={setKind} options={(Object.keys(POCKET_KINDS) as Envelope['kind'][]).map(k => ({ value: k, label: POCKET_KINDS[k] }))} />
      <Group foot="It starts empty; move money into it from the account's Main pocket.">
        <PickerRow label="Inside" value={accountId} options={holders.map(a => ({ value: a.id, label: a.name }))} onChange={setAccountId} />
        <InputRow label="Name" value={name} placeholder={kind === 'GOAL' ? 'e.g. Japan trip' : 'e.g. Rent'} onInput={setName} />
        {kind === 'GOAL' && <><AmountField label="Goal" value={target} currency={currency} onChange={setTarget} /><InputRow label="By" type="date" value={date} onInput={setDate} /></>}
      </Group>
      <Block><Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Add pocket'}</Button></Block>
    </Sheet>
  );
}

/** Delete a category: its entries, budget and quick-add words move to another category of the same kind. */
function DeleteCategorySheet({ category, onClose, onDeleted }: { category: Category; onClose: () => void; onDeleted: () => void }) {
  const others = active(catalog.value.categories).filter(c => c.kind === category.kind && c.id !== category.id && !['Balance adjustment', 'Opening balance'].includes(c.name));
  const fallback = others.find(c => c.name === (category.kind === 'EXPENSE' ? 'Other' : 'Other income')) ?? others[0];
  const [moveTo, setMoveTo] = useState<string | null>(fallback?.id ?? null);
  const remove = () => attempt(async () => {
    await call(client.api.categories[':id'].$delete({ param: { id: category.id }, json: { moveTo: moveTo! } }));
    showToast(`Deleted ${category.name}`);
    onDeleted();
    await refresh();
  });
  return (
    <Sheet open onClose={onClose} title={`Delete ${category.name}`}>
      <Group foot={`Everything in ${category.name} (entries, its budget, quick-add words) moves there. ${category.name} is gone from your lists; a reset brings the starting categories back.`}>
        <PickerRow label="Move its entries to" value={moveTo} options={others.map(c => ({ value: c.id, label: c.name }))} onChange={setMoveTo} />
      </Group>
      <Block><Button large rounded className="k-color-brand-red" disabled={!moveTo} onClick={remove}>Delete category</Button></Block>
    </Sheet>
  );
}

function AddCategory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const save = () => attempt(async () => {
    await call(client.api.categories.$post({ json: { name: name.trim(), kind } }));
    await refresh();
    setName('');
    onClose();
  });
  return (
    <Sheet open={open} onClose={onClose} title="Add category">
      <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: 'Spending' }, { value: 'INCOME', label: 'Income' }]} />
      <Group><InputRow label="Name" value={name} onInput={setName} /></Group>
      <Block><Button large rounded disabled={!name.trim()} onClick={save}>{name.trim() ? 'Add category' : 'Enter a name'}</Button></Block>
    </Sheet>
  );
}

