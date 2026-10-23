// The plans list under a lifted pay later / credit card card: one card per plan, a sheet per plan with one
// "Mark paid" per person per installment, and the form to add a plan.
import { Plus } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import { formatMoney } from '../../lib/format';
import { reducedMotion } from '../../lib/motion';
import { NewPlanSheet } from './NewPlanSheet';
import { PlanCard } from './PlanCard';
import { usePlans } from './plans';
import { PlanSheet } from './PlanSheet';

export function InstallmentsSection({ account }: { account: Account }) {
  const plans = usePlans(account.id);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = plans?.find(p => p.id === open) ?? null;
  return (
    <section className="mt-5" aria-label="Installments">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Installments</h3>
        {plans && plans.length > 0 && <span className="text-[13px] font-semibold text-muted">{formatMoney(plans.reduce((s, p) => s + p.remaining, 0), account.currency_code)} to go</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {plans?.map(p => (
            <motion.div key={p.id} initial={reducedMotion() ? false : { opacity: 0, y: -50, rotate: -4, scale: 1.05 }} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              exit={reducedMotion() ? undefined : { opacity: 0, y: -40, rotate: 4 }} transition={{ type: 'spring', stiffness: 140, damping: 17, opacity: { duration: 0.3 } }}>
              <PlanCard plan={p} currency={account.currency_code} onOpen={() => setOpen(p.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {plans && !plans.length && <p className="text-[15px] text-muted">Paying something off in parts? Add it to see what's due and who has paid.</p>}
        <button type="button" onClick={() => setAdding(true)}
          className="panel flex h-12 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80">
          <Plus size={18} weight="bold" aria-hidden="true" />Add installments
        </button>
      </div>
      <PlanSheet key={`plan:${shown?.id ?? 'none'}`} plan={shown} account={account} onClose={() => setOpen(null)} />
      <NewPlanSheet key={`new-plan:${adding}`} open={adding} account={account} onClose={() => setAdding(false)} />
    </section>
  );
}
