import type { ComponentChildren } from 'preact';

export function Banner({ children }: { children: ComponentChildren }) {
  return <div class="banner" role="status">{children}</div>;
}
