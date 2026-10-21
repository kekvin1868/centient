// Grouped inset lists (Konsta List, iOS Settings style). Group = optional label + list + footnote.
import { BlockFooter, BlockTitle, List, ListItem } from 'konsta/react';
import type { ComponentChildren } from 'preact';

export function Group({ label, foot, children }: { label?: string; foot?: string; children: ComponentChildren }) {
  return (
    <>
      {label && <BlockTitle className="!text-[13px] !font-normal uppercase tracking-wide opacity-60">{label}</BlockTitle>}
      <List strong inset dividers>{children}</List>
      {foot && <BlockFooter>{foot}</BlockFooter>}
    </>
  );
}

type RowProps = { title: ComponentChildren; sub?: ComponentChildren; trail?: ComponentChildren; media?: ComponentChildren; onClick?: () => void; chevron?: boolean };

/** One list row. Tappable rows render a real button, so they work from the keyboard too. */
export function Row({ title, sub, trail, media, onClick, chevron }: RowProps) {
  return (
    <ListItem title={title} subtitle={sub && <span class="text-black/55 dark:text-white/55">{sub}</span>} after={trail} media={media} strongTitle={false} chevron={Boolean(onClick && chevron)}
      link={Boolean(onClick)} linkComponent="button" linkProps={onClick ? { type: 'button', onClick } : undefined} />
  );
}
