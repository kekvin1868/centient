// Design preview for the owner's approval before Phase 3: tokens, type, and every shared component.
import { WifiSlash } from '@phosphor-icons/react';
import { useState } from 'preact/hooks';
import { AmountField } from '../components/AmountField';
import { Banner } from '../components/Banner';
import { BottomNav, type Screen } from '../components/BottomNav';
import { Chip } from '../components/Chip';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Group, Row } from '../components/List';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { formatMoney } from '../lib/format';

const SWATCHES = [
  ['--accent', 'Accent fill'], ['--on-accent', 'Text on accent'], ['--accent-text', 'Accent as text'],
  ['--bg', 'Background'], ['--surface', 'Surface'], ['--text', 'Text'], ['--muted', 'Secondary text'], ['--danger', 'Over budget / delete'],
];

export function Preview() {
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [amount, setAmount] = useState<number | null>(25000);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [nav, setNav] = useState<Screen>('home');

  return (
    <main class="screen">
      <h1 class="title">Centient</h1>
      <p class="muted" style="margin:-8px 4px 24px">Design preview. Switch your phone between light and dark mode to see both.</p>

      <Group label="Colors">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px">
          {SWATCHES.map(([v, name]) => (
            <div style="text-align:center">
              <div style={`height:48px;border-radius:10px;background:var(${v});border:1px solid var(--line)`} />
              <div class="small muted" style="margin-top:4px">{name}</div>
            </div>
          ))}
        </div>
      </Group>

      <div class="headline">
        <div class="muted small">Left this month</div>
        <div class="big num">{formatMoney(1_250_000)}</div>
        <div class="muted">12 days · {formatMoney(104_000)}/day</div>
      </div>

      <div class="logbox">
        <input class="input" placeholder="kopi 25rb gopay" />
        <button class="btn btn-primary" style="min-height:40px">Add</button>
      </div>
      <div class="chips">
        <Chip state="ready" emoji="🍜" title="Food & Drink" sub="GoPay · today" amount={formatMoney(25000)} onOpen={() => setSheet(true)} />
        <Chip state="ask" emoji="🍕" title="Pizza Hut" sub="Split with 3 · BCA" question="Which amount did you mean?" onOpen={() => setSheet(true)}>
          {[100, 100_000].map(v => <button class={`pill ${pick === v ? 'on' : ''}`} onClick={() => setPick(v)}>{formatMoney(v)}</button>)}
        </Chip>
        <Chip state="incomplete" emoji="🅿️" title="Parkir" sub="Pick a category" amount={formatMoney(5000)} onOpen={() => setSheet(true)} />
      </div>
      <div style="height:28px" />
      <Group label="Today">
        <Row title="Kopi Kenangan" sub="Food & Drink · GoPay" trail={formatMoney(-25000)} onClick={() => setSheet(true)} />
        <Row title="Salary" sub="Received · BCA" trail={<span class="received">+{formatMoney(9_500_000)}</span>} onClick={() => setSheet(true)} />
        <Row title="BCA → GoPay" sub="Moved · admin fee Rp2.500" trail={formatMoney(500_000)} onClick={() => setSheet(true)} />
      </Group>

      <Group label="Budgets">
        <Row title="Food" sub={<>{formatMoney(250_000)} of {formatMoney(1_500_000)}<div class="bar"><div style="width:17%" /></div></>} trail="" />
        <Row title="Shopping" sub={<>{formatMoney(620_000)} of {formatMoney(500_000)}<div class="bar over"><div style="width:100%" /></div></>} trail={<span class="danger-text small">Over</span>} />
      </Group>

      <Group label="Controls">
        <div style="padding:12px 16px"><Segmented label="Type" value={type} onChange={setType}
          options={[{ value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' }]} /></div>
        <AmountField value={amount} onChange={setAmount} />
        <label class="field"><span class="field-label">Note</span><input class="input" placeholder="Optional" /></label>
      </Group>

      <Banner><WifiSlash size={18} /> No connection, your entry is still here.</Banner>

      <div style="display:grid;gap:10px;margin-bottom:28px">
        <button class="btn btn-primary btn-block" onClick={() => setSheet(true)}>Open a sheet (drag it down to close)</button>
        <button class="btn btn-secondary btn-block" onClick={() => showToast('Saved')}>Show a toast</button>
        <button class="btn btn-secondary btn-block danger-text" onClick={() => setConfirm(true)}>Delete something</button>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Edit entry">
        <Group>
          <div style="padding:12px 16px"><Segmented label="Type" value={type} onChange={setType}
            options={[{ value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' }]} /></div>
          <AmountField value={amount} onChange={setAmount} />
          <Row title="Account" trail="GoPay" chevron onClick={() => {}} />
          <Row title="Category" trail="Food & Drink" chevron onClick={() => {}} />
        </Group>
        <button class="btn btn-primary btn-block" onClick={() => { setSheet(false); showToast('Saved'); }}>Save</button>
      </Sheet>

      <ConfirmSheet open={confirm} message="Delete Kopi Kenangan, Rp25.000?" confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); showToast('Deleted', { action: { label: 'Undo', run: () => showToast('Restored') } }); }} />

      <BottomNav current={nav} onGo={setNav} />
    </main>
  );
}
