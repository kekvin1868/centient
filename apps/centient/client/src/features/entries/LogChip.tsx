// One card under the log box: what was understood, a question when something is missing (amount, account,
// what was charged), and a flick up to log it.
import { ArrowFatUp } from '@phosphor-icons/react';
import { Button, List } from 'konsta/react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { categoryEmoji, titleCase } from '../../lib/labels';
import { reducedMotion } from '../../lib/motion';
import { catalog, everyday, nameOf } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { Chip } from './Chip';
import { chipView, type Form, type LogItem } from './form';

export function LogChip({ item, today, onChange, onOpen, onLog }: { item: LogItem; today: string; onChange: (i: LogItem) => void; onOpen: () => void; onLog: () => Promise<boolean> }) {
  const [charged, setCharged] = useState<number | null>(null);
  const cat = catalog.value;
  const f = item.form;
  const v = chipView(item);
  const category = nameOf(cat.categories, f.categoryId);
  const title = f.type === 'TRANSFER'
    ? `${nameOf(cat.accounts, f.accountId) || '?'} → ${nameOf(cat.accounts, f.toAccountId) || '?'}`
    : (f.merchant ? titleCase(f.merchant) : category) || (f.type === 'INCOME' ? 'Received' : 'Spent');
  const sub = v.state === 'incomplete' ? v.missing : [
    f.type === 'TRANSFER' ? 'Moved' : f.merchant ? category : '',
    f.type !== 'TRANSFER' ? nameOf(cat.accounts, f.accountId) : '',
    f.split ? `split with ${f.split}` : '',
    f.fee ? `admin fee ${formatMoney(f.fee)}` : '',
    f.date !== today ? f.date : '',
  ].filter(Boolean).join(' · ');
  const currency = cat.accounts.find(a => a.id === f.accountId)?.currency_code ?? 'IDR';
  const set = (patch: Partial<LogItem>, form: Partial<Form> = {}) => onChange({ ...item, ...patch, form: { ...f, ...form } });

  // Flick a ready card up to log it: past 70px (or a quick flick) it flies off; otherwise it springs back.
  const y = useMotionValue(0);
  const opacity = useTransform(y, [-160, 0], [0, 1]);
  const dragged = useRef(false);
  const ready = v.state === 'ready';
  const fling = async () => {
    const off = reducedMotion() ? { duration: 0 } : { duration: 0.22 };
    await animate(y, -260, off);
    if (!(await onLog())) animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
  };

  return (
    <motion.div style={{ y, opacity }} drag={ready ? 'y' : false} dragConstraints={{ bottom: 0 }} dragElastic={{ bottom: 0.05 }} dragMomentum={false}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={(_, info) => {
        setTimeout(() => { dragged.current = false; });
        if (info.offset.y < -70 || info.velocity.y < -500) fling();
        else animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
      }}>
      <Chip state={v.state} emoji={categoryEmoji(category, f.type)} title={title} sub={sub}
        amount={f.amount ? formatMoney(f.amount, currency) : undefined} question={v.state === 'ask' ? v.question : undefined}
        onOpen={() => { if (!dragged.current) onOpen(); }}
        hint={ready ? <span className="flex items-center gap-1 [animation:nudge_1.4s_ease-in-out_infinite]"><ArrowFatUp size={12} weight="fill" aria-hidden="true" />Flick</span> : undefined}>
        {v.state === 'ask' && v.ask === 'amount' && item.candidates.map(c => (
          <Button key={c} small rounded inline tonal={c !== f.amount} onClick={() => set({ askAmount: false }, { amount: c })}>{formatMoney(c, currency)}</Button>
        ))}
        {v.state === 'ask' && v.ask === 'account' && everyday().slice(0, 4).map(a => (
          <Button key={a.id} small rounded inline tonal onClick={() => set({}, { accountId: a.id })}>{a.name}</Button>
        ))}
        {v.state === 'ask' && v.ask === 'charged' && (
          <div className="flex w-full items-end gap-2">
            <List strong inset className="!m-0 flex-1"><AmountField label="Charged" value={charged} onChange={setCharged} /></List>
            <Button rounded inline disabled={!charged} onClick={() => set({ askCharged: false }, { amount: charged })}>OK</Button>
          </div>
        )}
      </Chip>
    </motion.div>
  );
}
