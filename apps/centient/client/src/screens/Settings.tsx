// Settings: accounts, Pockets, categories, when the month starts, and export. "Hide" keeps history.
import { useState } from 'preact/hooks';
import type { Account, Category, Envelope } from '../../../src/application/ports';
import { call, client } from '../api';
import { AccountForm } from '../components/AccountForm';
import { AmountField } from '../components/AmountField';
import { InputRow, PickerRow } from '../components/Fields';
import { Group, Row } from '../components/List';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { ACCOUNT_KINDS } from '../lib/format';
import { categoryEmoji } from '../lib/labels';
import { attempt } from '../lib/run';
import { active, catalog, me, nameOf, refresh } from '../state';

type Edit = { table: 'accounts'; row: Account } | { table: 'envelopes'; row: Envelope } | { table: 'categories'; row: Category };
const POCKET_KINDS: Record<Envelope['kind'], string> = { SPENDING: 'Spending', SAVINGS: 'Savings', GOAL: 'Goal' };

export function Settings() {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [add, setAdd] = useState<'account' | 'pocket' | 'category' | null>(null);
  const cat = catalog.value;
  const hidden = [...cat.accounts, ...cat.envelopes, ...cat.categories].filter(r => r.archived_at).length;

  return (
    <main class="screen">
      <h1 class="title">Settings</h1>

      <Group label="Accounts">
        {active(cat.accounts).map(a => <Row key={a.id} title={a.name} sub={`${ACCOUNT_KINDS[a.kind]}${a.currency_code !== 'IDR' ? ` · ${a.currency_code}` : ''}`} chevron onClick={() => setEdit({ table: 'accounts', row: a })} />)}
        <Row title={<span class="received">Add account</span>} onClick={() => setAdd('account')} />
      </Group>

      <Group label="Pockets" foot="Pockets say what money is for. Every account's money sits in one.">
        {active(cat.envelopes).map(e => <Row key={e.id} title={e.name} sub={POCKET_KINDS[e.kind]} chevron onClick={() => setEdit({ table: 'envelopes', row: e })} />)}
        <Row title={<span class="received">Add Pocket</span>} onClick={() => setAdd('pocket')} />
      </Group>

      <Group label="Categories">
        {active(cat.categories).filter(c => !['Balance adjustment', 'Opening balance'].includes(c.name)).map(c => (
          <Row key={c.id} title={`${categoryEmoji(c.name, c.kind)} ${c.name}`} sub={c.kind === 'EXPENSE' ? 'Spending' : 'Income'} chevron onClick={() => setEdit({ table: 'categories', row: c })} />
        ))}
        <Row title={<span class="received">Add category</span>} onClick={() => setAdd('category')} />
      </Group>

      {hidden > 0 && (
        <Group label="Hidden">
          <details class="more" style="border-top:0">
            <summary>Show {hidden} hidden item{hidden === 1 ? '' : 's'}</summary>
            {cat.accounts.filter(a => a.archived_at).map(a => <Row key={a.id} title={a.name} sub="Account" trail={<ShowButton table="accounts" id={a.id} />} />)}
            {cat.envelopes.filter(e => e.archived_at).map(e => <Row key={e.id} title={e.name} sub="Pocket" trail={<ShowButton table="envelopes" id={e.id} />} />)}
            {cat.categories.filter(c => c.archived_at).map(c => <Row key={c.id} title={c.name} sub="Category" trail={<ShowButton table="categories" id={c.id} />} />)}
          </details>
        </Group>
      )}

      <MonthStart />

      <Group label="Your data">
        <Row title="Download all as spreadsheet (CSV)" chevron onClick={() => location.assign('/api/export.csv')} />
      </Group>

      <EditSheet key={edit ? `${edit.table}:${edit.row.id}` : 'none'} edit={edit} onClose={() => setEdit(null)} />
      <Sheet open={add === 'account'} onClose={() => setAdd(null)} title="Add account"><AccountForm onDone={() => setAdd(null)} /></Sheet>
      <AddPocket open={add === 'pocket'} onClose={() => setAdd(null)} />
      <AddCategory open={add === 'category'} onClose={() => setAdd(null)} />
    </main>
  );
}

function ShowButton({ table, id }: { table: Edit['table']; id: string }) {
  return (
    <button class="btn btn-plain" onClick={() => attempt(async () => {
      await call(client.api[':table{accounts|envelopes|categories}'][':id'].$patch({ param: { table, id }, json: { archived: false } }));
      await refresh();
    })}>Show</button>
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
    }
    if (edit.table === 'envelopes' && edit.row.kind === 'GOAL') { json.target_amount = target; json.target_date = targetDate || null; }
    return patch(json, 'Saved');
  };
  const what = edit.table === 'accounts' ? 'account' : edit.table === 'envelopes' ? 'Pocket' : 'category';

  return (
    <Sheet open onClose={onClose} title={edit.row.name}>
      <Group>
        <InputRow label="Name" value={name} onInput={setName} />
        {edit.table === 'accounts' && (
          <>
            <PickerRow label="Usual Pocket" value={defaultPocket} placeholder="First spending Pocket"
              options={active(cat.envelopes).filter(e => e.currency_code === currency).map(e => ({ value: e.id, label: e.name }))} onChange={setDefaultPocket} />
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
      {edit.table === 'accounts' && <p class="hint-line">Currency can change only before the account has entries.</p>}
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>Save</button>
        <button class="btn btn-secondary btn-block" onClick={() => patch({ archived: true }, `Hidden. Find it under Hidden to show it again.`)}>Hide this {what}</button>
      </div>
    </Sheet>
  );
}

function AddPocket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Envelope['kind']>('SPENDING');
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const error = !name.trim() ? 'Enter a name' : kind === 'GOAL' && !target ? 'Enter the goal amount' : null;
  const save = () => attempt(async () => {
    await call(client.api.envelopes.$post({ json: { name: name.trim(), kind, currency: 'IDR', targetAmount: kind === 'GOAL' ? target : null, targetDate: kind === 'GOAL' && date ? date : null } }));
    await refresh();
    setName(''); setTarget(null); setDate('');
    onClose();
  });
  return (
    <Sheet open={open} onClose={onClose} title="Add Pocket">
      <div style="margin-bottom:16px"><Segmented label="Kind" value={kind} onChange={setKind} options={(Object.keys(POCKET_KINDS) as Envelope['kind'][]).map(k => ({ value: k, label: POCKET_KINDS[k] }))} /></div>
      <Group>
        <InputRow label="Name" value={name} placeholder={kind === 'GOAL' ? 'e.g. Japan trip' : 'e.g. Social'} onInput={setName} />
        {kind === 'GOAL' && <><AmountField label="Goal" value={target} onChange={setTarget} /><InputRow label="By" type="date" value={date} onInput={setDate} /></>}
      </Group>
      <button class="btn btn-primary btn-block" disabled={Boolean(error)} onClick={save}>{error ?? 'Add Pocket'}</button>
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
      <div style="margin-bottom:16px"><Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: 'Spending' }, { value: 'INCOME', label: 'Income' }]} /></div>
      <Group><InputRow label="Name" value={name} onInput={setName} /></Group>
      <button class="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>{name.trim() ? 'Add category' : 'Enter a name'}</button>
    </Sheet>
  );
}

