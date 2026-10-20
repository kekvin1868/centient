// Grouped inset list, iOS Settings style.
import type { ComponentChildren } from 'preact';

export function Group({ label, foot, children }: { label?: string; foot?: string; children: ComponentChildren }) {
  return (
    <section class="group">
      {label && <h2 class="group-label">{label}</h2>}
      <div class="group-body">{children}</div>
      {foot && <p class="group-foot">{foot}</p>}
    </section>
  );
}

type RowProps = { title: ComponentChildren; sub?: ComponentChildren; trail?: ComponentChildren; onClick?: () => void; chevron?: boolean };

export function Row({ title, sub, trail, onClick, chevron }: RowProps) {
  const body = (
    <>
      <span class="row-main">
        <span class="row-title" style="display:block">{title}</span>
        {sub && <span class="row-sub" style="display:block">{sub}</span>}
      </span>
      {trail !== undefined && <span class="row-trail num">{trail}</span>}
      {chevron && <span class="chev" aria-hidden="true">›</span>}
    </>
  );
  return onClick ? <button type="button" class="row" onClick={onClick}>{body}</button> : <div class="row">{body}</div>;
}
