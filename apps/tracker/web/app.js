// Balance Tracker web client: plain JS, no libraries. Talks to the Worker's /api.
// ponytail: bare-minimum UI for testing; the real PWA (offline, push) comes later.

const state = { me: null, accounts: [], envelopes: [], categories: [], drafts: [], cursor: null };
const $ = sel => document.querySelector(sel);

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
  return data;
}

// ---- money and names -------------------------------------------------------
const decimals = cur => state.me?.currencies?.[cur] ?? 0;
const toMinor = (major, cur = 'IDR') => Math.round(Number(major) * 10 ** decimals(cur));
const toMajor = (minor, cur = 'IDR') => minor / 10 ** decimals(cur);
function fmt(minor, cur = 'IDR') {
  const d = decimals(cur);
  const s = Math.abs(minor / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${minor < 0 ? '-' : ''}${cur === 'IDR' ? 'Rp' : `${cur} `}${s}`;
}
const byId = (rows, id) => rows.find(r => r.id === id);
const nameOf = (rows, id) => byId(rows, id)?.name ?? '?';
const currencyOfAccount = id => byId(state.accounts, id)?.currency_code ?? 'IDR';
const titleCase = s => (s ?? '').replace(/\b\p{L}/gu, c => c.toUpperCase());
const active = rows => rows.filter(r => !r.archived_at);

// ---- tiny DOM helpers -----------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter(c => c !== null && c !== undefined && c !== false));
  return el;
}
function select(items, value, { empty, onchange } = {}) {
  const opts = items.map(i => h('option', { value: i.id, text: i.name, selected: i.id === value }));
  if (empty !== undefined) opts.unshift(h('option', { value: '', text: empty, selected: !value }));
  return h('select', { onchange }, opts);
}
function fill(el, items, empty) {
  el.replaceChildren(...(empty !== undefined ? [h('option', { value: '', text: empty })] : []), ...items.map(i => h('option', { value: i.id, text: i.name })));
}
let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = error ? 'error' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 2500);
}
const guard = fn => async (...args) => { try { await fn(...args); } catch (e) { toast(e.message, true); } };

// ---- tabs -----------------------------------------------------------------
const loaders = { history: () => loadTx(true), balances: loadBalances, budgets: loadBudgets, setup: renderSetup };
$('#tabs').addEventListener('click', guard(async e => {
  const tab = e.target.dataset?.tab;
  if (!tab) return;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b === e.target);
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== tab;
  await loaders[tab]?.();
}));

// ---- catalog ----------------------------------------------------------------
async function reloadCatalog() {
  Object.assign(state, await api('GET', '/api/catalog'));
  fill($('#f-account'), active(state.accounts), 'All accounts');
  const bf = $('#budget-form');
  fill(bf.categoryId, active(state.categories).filter(c => c.kind === 'EXPENSE'), 'Any category');
  fill(bf.envelopeId, active(state.envelopes).filter(e => e.kind === 'SPENDING'), 'Any envelope');
}

// ---- add: quick add and draft cards ---------------------------------------
function blankDraft(type = 'EXPENSE') {
  const everyday = active(state.accounts).find(a => ['BANK', 'EWALLET', 'CASH'].includes(a.kind));
  return {
    text: '', type, amount: null, candidates: [], needsConfirm: false, confirmed: true,
    accountId: everyday?.id ?? null, toAccountId: null, categoryId: null, envelopeId: null,
    fromEnvelopeId: null, toEnvelopeId: null, merchant: '', date: state.me.today, split: null,
    iouAccountId: null, fee: null, note: '', fromParse: false,
  };
}

$('#qa-parse').addEventListener('click', guard(async () => {
  const text = $('#qa-text').value.trim();
  if (!text) return;
  const { drafts } = await api('POST', '/api/quickadd/parse', { text });
  const iou = active(state.accounts).find(a => a.kind === 'IOU');
  state.drafts.push(...drafts.map(d => ({
    ...blankDraft(d.type), ...d, fromParse: true, suggestedMerchant: d.merchant, confirmed: !d.needsConfirm,
    envelopeId: null, iouAccountId: d.split ? iou?.id ?? null : null,
  })));
  renderDrafts();
}));
$('#qa-blank').addEventListener('click', () => { state.drafts.push(blankDraft()); renderDrafts(); });

function renderDrafts() {
  $('#drafts').replaceChildren(...state.drafts.map(draftCard));
  $('#qa-save').hidden = state.drafts.length === 0;
}

function field(label, control) {
  return h('label', {}, h('span', { class: 'hint', text: label }), control);
}

function draftCard(d) {
  const rerender = () => renderDrafts();
  const set = (k, v, redraw = false) => { d[k] = v === '' ? null : v; if (redraw) rerender(); };
  const accounts = active(state.accounts);
  const cur = d.type === 'ALLOCATE' ? 'IDR' : currencyOfAccount(d.accountId);

  const amountInput = h('input', {
    type: 'number', step: 'any', min: '0', placeholder: 'Amount',
    value: d.amount !== null ? String(toMajor(d.amount, cur)) : '',
    oninput: e => { d.amount = e.target.value === '' ? null : toMinor(e.target.value, cur); d.confirmed = true; },
  });
  // An inferred amount ("100" -> Rp100,000) must be confirmed before saving.
  const amountBlock = d.needsConfirm && !d.confirmed
    ? h('div', { class: 'confirm' },
        h('span', { text: d.amount !== null ? `We read this as ${fmt(d.amount)}. Is that right?` : 'Which amount did you mean?' }),
        h('div', { class: 'row' }, d.candidates.map(c => h('button', {
          type: 'button', class: c === d.amount ? '' : 'secondary', text: fmt(c),
          onclick: () => { d.amount = c; d.confirmed = true; rerender(); },
        }))),
        field('Or type it', amountInput))
    : field(`Amount (${cur})`, amountInput);

  const typeSelect = h('select', { onchange: e => { d.type = e.target.value; d.categoryId = null; rerender(); } },
    ['EXPENSE', 'INCOME', 'TRANSFER', 'ALLOCATE'].map(t => h('option', { value: t, text: t[0] + t.slice(1).toLowerCase(), selected: t === d.type })));

  let fields;
  if (d.type === 'EXPENSE' || d.type === 'INCOME') {
    const cats = active(state.categories).filter(c => c.kind === d.type);
    fields = [
      h('div', { class: 'grid2' },
        field('Account', select(accounts, d.accountId, { empty: 'Pick account', onchange: e => set('accountId', e.target.value, true) })),
        field('Category', select(cats, d.categoryId, { empty: 'Pick category', onchange: e => set('categoryId', e.target.value) }))),
      h('div', { class: 'grid2' },
        field('Merchant', h('input', { value: d.merchant ?? '', oninput: e => set('merchant', e.target.value) })),
        field('Envelope', select(active(state.envelopes), d.envelopeId, { empty: 'Account default', onchange: e => set('envelopeId', e.target.value) }))),
    ];
    if (d.type === 'EXPENSE') {
      fields.push(h('div', { class: 'grid2' },
        field('Split between (people, incl. you)', h('input', { type: 'number', min: '1', max: '50', value: d.split ?? '', oninput: e => set('split', e.target.value ? Number(e.target.value) : null) })),
        field('Others owe it to', select(accounts.filter(a => a.kind === 'IOU'), d.iouAccountId, { empty: 'Pick IOU account', onchange: e => set('iouAccountId', e.target.value) }))));
    }
  } else if (d.type === 'TRANSFER') {
    fields = [
      h('div', { class: 'grid2' },
        field('From', select(accounts, d.accountId, { empty: 'Pick account', onchange: e => set('accountId', e.target.value, true) })),
        field('To', select(accounts, d.toAccountId, { empty: 'Pick account', onchange: e => set('toAccountId', e.target.value) }))),
      field('Admin fee (Rp, optional)', h('input', { type: 'number', min: '0', value: d.fee ?? '', oninput: e => set('fee', e.target.value ? Number(e.target.value) : null) })),
    ];
  } else {
    const envs = active(state.envelopes);
    fields = [h('div', { class: 'grid2' },
      field('From envelope', select(envs, d.fromEnvelopeId, { empty: 'Pick envelope', onchange: e => set('fromEnvelopeId', e.target.value) })),
      field('To envelope', select(envs, d.toEnvelopeId, { empty: 'Pick envelope', onchange: e => set('toEnvelopeId', e.target.value) })))];
  }

  return h('div', { class: 'card' },
    h('div', { class: 'head' },
      h('span', { class: 'src', text: d.text ? `“${d.text}”` : 'Manual entry' }),
      h('button', { type: 'button', class: 'small danger', text: 'Remove', onclick: () => { state.drafts.splice(state.drafts.indexOf(d), 1); rerender(); } })),
    h('div', { class: 'grid2' }, field('Type', typeSelect), field('Date', h('input', { type: 'date', value: d.date, oninput: e => set('date', e.target.value) }))),
    amountBlock,
    ...fields,
    field('Note', h('input', { value: d.note ?? '', oninput: e => set('note', e.target.value) })));
}

function toCommand(d, n) {
  const need = (v, what) => { if (v === null || v === undefined || v === '') throw new Error(`Entry ${n}: ${what}`); return v; };
  if (d.needsConfirm && !d.confirmed) throw new Error(`Entry ${n}: confirm the amount`);
  const amount = need(d.amount, 'enter an amount');
  if (!(amount > 0)) throw new Error(`Entry ${n}: amount must be more than 0`);
  const base = { amount, date: need(d.date, 'pick a date'), note: d.note || undefined };
  switch (d.type) {
    case 'EXPENSE':
    case 'INCOME': {
      const cmd = {
        ...base, type: d.type, accountId: need(d.accountId, 'pick an account'), categoryId: need(d.categoryId, 'pick a category'),
        envelopeId: d.envelopeId || undefined, merchant: d.merchant || undefined,
      };
      if (d.type === 'EXPENSE' && d.split > 1) cmd.split = { people: d.split, iouAccountId: need(d.iouAccountId, 'pick who owes the rest') };
      return cmd;
    }
    case 'TRANSFER':
      return { ...base, type: 'TRANSFER', fromAccountId: need(d.accountId, 'pick the From account'), toAccountId: need(d.toAccountId, 'pick the To account'), fee: d.fee || undefined };
    case 'ALLOCATE':
      return { ...base, type: 'ALLOCATE', fromEnvelopeId: need(d.fromEnvelopeId, 'pick the From envelope'), toEnvelopeId: need(d.toEnvelopeId, 'pick the To envelope') };
  }
}

$('#qa-save').addEventListener('click', guard(async () => {
  const items = state.drafts.map((d, i) => ({
    command: toCommand(d, i + 1),
    ...(d.fromParse && d.rawMerchant ? { rawMerchant: d.rawMerchant, suggestedMerchant: d.suggestedMerchant ?? '' } : {}),
  }));
  await api('POST', '/api/quickadd/save', { items });
  toast(`Saved ${items.length} entr${items.length === 1 ? 'y' : 'ies'}`);
  state.drafts = [];
  $('#qa-text').value = '';
  renderDrafts();
}));

// ---- history --------------------------------------------------------------
async function loadTx(reset) {
  if (reset) { state.cursor = null; $('#tx-list').replaceChildren(); }
  const q = new URLSearchParams({ limit: '30' });
  for (const [k, sel] of [['from', '#f-from'], ['to', '#f-to'], ['account', '#f-account'], ['type', '#f-type']]) {
    if ($(sel).value) q.set(k, $(sel).value);
  }
  if (state.cursor) q.set('cursor', state.cursor);
  const { items, nextCursor } = await api('GET', `/api/transactions?${q}`);
  state.cursor = nextCursor;
  $('#tx-list').append(...items.map(txRow));
  $('#tx-more').hidden = !nextCursor;
  if (reset && !items.length) $('#tx-list').append(h('li', { class: 'sub', text: 'No transactions yet.' }));
}
$('#f-apply').addEventListener('click', guard(() => loadTx(true)));
$('#tx-more').addEventListener('click', guard(() => loadTx(false)));

function txRow(t) {
  const acc = id => nameOf(state.accounts, id);
  const env = id => nameOf(state.envelopes, id);
  let title = titleCase(t.merchant) || (t.category_id ? nameOf(state.categories, t.category_id) : t.type);
  let amount;
  if (t.type === 'TRANSFER') {
    const from = t.entries.find(e => e.amount < 0), to = t.entries.find(e => e.amount > 0);
    if (!t.merchant) title = `${acc(from?.account_id)} → ${acc(to?.account_id)}`;
    amount = h('span', { text: fmt(Math.abs(from?.amount ?? 0), currencyOfAccount(from?.account_id)) });
  } else if (t.type === 'ALLOCATE') {
    const from = t.allocations.find(a => a.amount < 0), to = t.allocations.find(a => a.amount > 0);
    title = `${env(from?.envelope_id)} → ${env(to?.envelope_id)}`;
    amount = h('span', { text: fmt(Math.abs(from?.amount ?? 0)) });
  } else {
    const e = t.entries[0];
    amount = h('span', { class: e.amount < 0 ? 'neg' : 'pos', text: fmt(e.amount, currencyOfAccount(e.account_id)) });
  }
  const where = t.type === 'ALLOCATE' ? 'envelopes' : t.entries.map(e => acc(e.account_id)).join(', ');
  const sub = [t.occurred_at.slice(0, 16).replace('T', ' '), t.type.toLowerCase(), t.category_id && t.merchant ? nameOf(state.categories, t.category_id) : null, where, t.note]
    .filter(Boolean).join(' · ');
  const li = h('li', {},
    h('div', {}, h('div', { text: title }), h('div', { class: 'sub', text: sub })),
    h('div', { class: 'amount' }, amount, h('div', {}, h('button', {
      class: 'small danger', text: 'Delete',
      onclick: guard(async () => {
        if (!confirm(`Delete "${title}"?`)) return;
        await api('DELETE', `/api/transactions/${t.id}`);
        li.remove();
        toast('Deleted');
      }),
    }))));
  return li;
}

// ---- balances -------------------------------------------------------------
async function loadBalances() {
  const { accounts, envelopes } = await api('GET', '/api/balances');
  const totals = {};
  for (const a of accounts) totals[a.currency_code] = (totals[a.currency_code] ?? 0) + a.balance;
  $('#bal-accounts').replaceChildren(
    ...accounts.map(a => h('li', {},
      h('div', {}, h('div', { text: a.name }), h('div', { class: 'sub', text: [a.kind.toLowerCase().replace('_', ' '), a.provider].filter(Boolean).join(' · ') })),
      h('div', { class: `amount ${a.balance < 0 ? 'neg' : ''}`, text: fmt(a.balance, a.currency_code) }))),
    ...Object.entries(totals).map(([cur, v]) => h('li', {}, h('strong', { text: `Total ${cur}` }), h('strong', { class: 'amount', text: fmt(v, cur) }))));
  $('#bal-envelopes').replaceChildren(...envelopes.map(e => {
    const goal = e.kind === 'GOAL' && e.target_amount;
    const pct = goal ? Math.min(100, Math.round((e.balance / e.target_amount) * 100)) : null;
    return h('li', {},
      h('div', { style: 'flex:1' },
        h('div', { text: e.name }),
        h('div', { class: 'sub', text: goal ? `goal ${fmt(e.target_amount, e.currency_code)}${e.target_date ? ` by ${e.target_date}` : ''} · ${pct}%` : e.kind.toLowerCase() }),
        goal ? h('div', { class: 'bar' }, h('div', { style: `width:${Math.max(0, pct)}%` })) : null),
      h('div', { class: `amount ${e.balance < 0 ? 'neg' : ''}`, text: fmt(e.balance, e.currency_code) }));
  }));
}

// ---- budgets --------------------------------------------------------------
async function loadBudgets() {
  const { cycle, budgets } = await api('GET', '/api/budgets');
  $('#cycle').textContent = `This cycle: ${cycle.from} to ${cycle.to} (exclusive) · ${cycle.daysLeft} days left`;
  $('#budget-list').replaceChildren(...(budgets.length ? budgets.map(b => {
    const name = [b.categoryId && nameOf(state.categories, b.categoryId), b.envelopeId && nameOf(state.envelopes, b.envelopeId)].filter(Boolean).join(' in ');
    const li = h('li', {},
      h('div', { style: 'flex:1' },
        h('div', { text: name }),
        h('div', { class: 'sub', text: `${fmt(b.spent)} of ${fmt(b.limit)} · ${b.remaining >= 0 ? `${fmt(b.remaining)} left` : `${fmt(-b.remaining)} over`}${b.safePerDay !== null ? ` · ${fmt(b.safePerDay)}/day` : ''}` }),
        h('div', { class: `bar ${b.percent > 100 ? 'over' : ''}` }, h('div', { style: `width:${Math.min(100, b.percent)}%` }))),
      h('button', {
        class: 'small danger', text: 'Delete',
        onclick: guard(async () => { if (confirm(`Delete the ${name} budget?`)) { await api('DELETE', `/api/budgets/${b.id}`); li.remove(); } }),
      }));
    return li;
  }) : [h('li', { class: 'sub', text: 'No budgets yet.' })]));
}
$('#budget-form').addEventListener('submit', guard(async e => {
  e.preventDefault();
  const f = e.target;
  await api('PUT', '/api/budgets', { categoryId: f.categoryId.value || null, envelopeId: f.envelopeId.value || null, limit: Number(f.limit.value) });
  f.reset();
  toast('Budget saved');
  await loadBudgets();
}));

// ---- setup ----------------------------------------------------------------
function renderSetup() {
  $('#ws-form').cycle_start_day.value = state.me.workspace.cycle_start_day;
  fill($('#account-form').currency, Object.keys(state.me.currencies).map(c => ({ id: c, name: c })));
  const item = (table, r, sub) => h('li', {},
    h('div', {}, h('div', { text: r.name + (r.archived_at ? ' (archived)' : '') }), h('div', { class: 'sub', text: sub })),
    h('button', {
      class: 'small', text: r.archived_at ? 'Restore' : 'Archive',
      onclick: guard(async () => { await api('PATCH', `/api/${table}/${r.id}`, { archived: !r.archived_at }); await reloadCatalog(); renderSetup(); }),
    }));
  $('#catalog-list').replaceChildren(
    ...state.accounts.map(a => item('accounts', a, `account · ${a.kind.toLowerCase()} · ${a.currency_code}`)),
    ...state.envelopes.map(e => item('envelopes', e, `envelope · ${e.kind.toLowerCase()}`)),
    ...state.categories.map(c => item('categories', c, `category · ${c.kind.toLowerCase()}`)));
}
async function afterCreate(form, msg) {
  form.reset();
  toast(msg);
  await reloadCatalog();
  renderSetup();
}
$('#ws-form').addEventListener('submit', guard(async e => {
  e.preventDefault();
  await api('PATCH', '/api/workspace', { cycle_start_day: Number(e.target.cycle_start_day.value) });
  state.me = await api('GET', '/api/me');
  toast('Saved');
}));
$('#account-form').addEventListener('submit', guard(async e => {
  e.preventDefault();
  const f = e.target;
  const currency = f.currency.value;
  await api('POST', '/api/accounts', {
    name: f.name.value, kind: f.kind.value, provider: f.provider.value || null, currency,
    openingBalance: f.openingBalance.value ? toMinor(f.openingBalance.value, currency) : undefined,
    dueDay: f.dueDay.value ? Number(f.dueDay.value) : null,
  });
  await afterCreate(f, 'Account added');
}));
$('#envelope-form').addEventListener('submit', guard(async e => {
  e.preventDefault();
  const f = e.target;
  const goal = f.kind.value === 'GOAL';
  await api('POST', '/api/envelopes', {
    name: f.name.value, kind: f.kind.value,
    targetAmount: goal && f.targetAmount.value ? Number(f.targetAmount.value) : null,
    targetDate: goal && f.targetDate.value ? f.targetDate.value : null,
  });
  await afterCreate(f, 'Envelope added');
}));
$('#category-form').addEventListener('submit', guard(async e => {
  e.preventDefault();
  await api('POST', '/api/categories', { name: e.target.name.value, kind: e.target.kind.value });
  await afterCreate(e.target, 'Category added');
}));

// ---- start ------------------------------------------------------------------
guard(async () => {
  state.me = await api('GET', '/api/me');
  await reloadCatalog();
  renderDrafts();
})();
