import { Block } from 'konsta/react';
import type { ComponentChildren } from 'preact';

export function Banner({ children }: { children: ComponentChildren }) {
  return <Block strong inset role="status" className="!my-3 flex items-center gap-2 text-[15px]">{children}</Block>;
}
