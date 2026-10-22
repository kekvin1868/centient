// The HUD on Home: answers "how much can I still spend?". Teal when fine, pink when it's below zero. With a
// budget it shows what's left this month; without one, the money in everyday accounts' Main pockets.
import { useEffect, useState } from 'react';
import { call, client } from '../../lib/api';
import { ACCOUNT_KINDS, formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { everyday, me, selectedAccount, version } from '../../lib/state';
import { BigMoney } from '../../ui/BigMoney';

type Head = { label: string; minor: number; currency: string; note: string; tag?: string; hurt: boolean; cta: string };
// Last data shown, per account, so coming back to Home shows it at once instead of rebuilding the screen.
const headCache = new Map<string, Head>();

export function Headline({ onGoMoney }: { onGoMoney: () => void }) {
  const key = selectedAccount.value ?? 'all';
  const [head, setHead0] = useState<Head | null>(headCache.get(key) ?? null);
  const setHead = (h: Head) => { headCache.set(key, h); setHead0(h); };
  useEffect(() => {
    attempt(async () => {
      const sel = selectedAccount.value;
      const bal = await call(client.api.balances.$get());
      if (sel) {
        const a = bal.accounts.find(x => x.id === sel);
        if (a) return setHead({ label: `In ${a.name}`, minor: a.balance, currency: a.currency_code, note: ACCOUNT_KINDS[a.kind] ?? '', hurt: false, cta: 'Update balance' });
      }
      const b = await call(client.api.budgets.$get({ query: {} }));
      const startDay = me.value?.workspace.cycle_start_day ?? 1;
      if (b.budgets.length) {
        const left = b.budgets.reduce((s, x) => s + Math.max(0, x.remaining), 0);
        const perDay = b.budgets.reduce((s, x) => s + (x.safePerDay ?? 0), 0);
        const d = b.cycle.daysLeft;
        return setHead({
          label: left > 0 ? (startDay === 1 ? 'Left this month' : `Left until ${b.cycle.to}`) : 'Budget spent',
          minor: left, currency: 'IDR', note: left > 0 ? `About ${formatMoney(perDay)} a day` : 'Every budget is used up for this month',
          tag: `${d} day${d === 1 ? '' : 's'} left`, hurt: left <= 0, cta: 'Budgets',
        });
      }
      // No budget yet: what's free to spend is the money in the Main pockets of everyday accounts (rupiah).
      // Money moved into other pockets is set aside, so it doesn't count.
      const mains = new Set(everyday().filter(x => !['CREDIT_CARD', 'PAYLATER', 'EXCHANGE'].includes(x.kind) && x.currency_code === 'IDR').map(x => x.default_envelope_id));
      const free = bal.envelopes.filter(e => mains.has(e.id)).reduce((t, e) => t + e.balance, 0);
      const over = free < 0;
      setHead({
        label: over ? 'Overspent' : 'Free to spend', minor: free, currency: 'IDR',
        note: over ? 'Your accounts\' Main pockets are below zero.' : 'Money in your accounts\' Main pockets. A budget shows a daily amount.',
        hurt: over, cta: 'Set a budget',
      });
    });
  }, [version.value, selectedAccount.value]);

  const card = `panel halftone relative mx-4 mt-4 mb-5 rounded-[24px] px-5 pt-4 pb-5 transition-colors duration-500 ${head?.hurt ? 'bg-pink text-white' : 'bg-miku text-[#0b0f0f]'}`;
  if (!head) return <div className={`${card} min-h-48`} />;
  return (
    <section className={card} aria-label="What you can spend">
      <div className="relative flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-bold leading-none">{head.label}</h2>
        {head.tag && <span className="shrink-0 rotate-3 rounded-md bg-[#0b0f0f] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-miku">{head.tag}</span>}
      </div>
      <BigMoney minor={head.minor} currency={head.currency} max={68} inset={76} className="relative mt-4" />
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <p className={`text-[15px] font-medium leading-snug ${head.hurt ? '' : 'opacity-80'}`}>{head.note}</p>
        <button type="button" onClick={onGoMoney}
          className="shrink-0 rounded-full bg-[#0b0f0f] px-3.5 py-2 text-[15px] font-bold text-white active:opacity-80">
          {head.cta} ▸
        </button>
      </div>
    </section>
  );
}
