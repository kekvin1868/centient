// A small solid tag that says what something is or how it stands, in words and colour both: UNPAID, INSTALLMENT,
// INTEREST, MATCH ✓, +50.000 MISSING… 12px bold capitals on a filled chip, so it reads at a glance on paper or the
// app's beige, in the clean Geist face (the pixel face blurs at this size). Tones come from the theme (--ok / --warn / --bad / --miku / --pink).
import type { ReactNode } from 'react';

export type TagTone = 'ok' | 'warn' | 'bad' | 'miku' | 'pink' | 'plain';

const TONE: Record<TagTone, string> = {
  ok: 'bg-ok text-on-tone',
  warn: 'bg-warn text-on-tone',
  bad: 'bg-bad text-on-tone',
  miku: 'bg-miku text-on-miku',
  pink: 'bg-pink text-white',
  plain: 'bg-raised-2 text-ink',
};

export function Tag({ tone = 'plain', children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      style={{ fontFamily: "'Geist Variable', system-ui, sans-serif" }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-edge px-2 py-[2px] text-[12px] font-bold uppercase leading-[1.35] tracking-[0.06em] shadow-[0_2px_0_var(--lip)] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
