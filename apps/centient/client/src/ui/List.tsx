// Grouped inset lists (Konsta List on flat gray cards). Group = optional bold heading (with an optional button at its
// far right) + list + footnote.
import { BlockFooter, BlockTitle, List, ListItem } from 'konsta/react';
import type { ReactNode } from 'react';

export function Group({ label, aside, foot, children }: { label?: string; aside?: ReactNode; foot?: string; children: ReactNode }) {
  return (
    <>
      {label && (
        <BlockTitle medium className={`!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em] ${aside ? '!flex items-center justify-between gap-3 !pr-4' : ''}`}>
          {aside ? <><span>{label}</span>{aside}</> : label}
        </BlockTitle>
      )}
      <List strong inset dividers>{children}</List>
      {foot && <BlockFooter inset>{foot}</BlockFooter>}
    </>
  );
}

type RowProps = { title: ReactNode; sub?: ReactNode; trail?: ReactNode; media?: ReactNode; onClick?: () => void; chevron?: boolean };

/** One list row. Tappable rows render a real button, so they work from the keyboard too. */
export function Row({ title, sub, trail, media, onClick, chevron }: RowProps) {
  return (
    <ListItem title={title} subtitle={sub && <span className="text-muted">{sub}</span>} after={trail} media={media} strongTitle={false} chevron={Boolean(onClick && chevron)}
      link={Boolean(onClick)} linkComponent="button" linkProps={onClick ? { type: 'button', onClick } : undefined} />
  );
}
