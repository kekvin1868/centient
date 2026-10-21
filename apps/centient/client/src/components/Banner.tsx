import { Block } from 'konsta/react';
import type { ReactNode } from 'react';

export function Banner({ children }: { children: ReactNode }) {
  return <Block strong inset role="status" className="!my-3 flex items-center gap-2 text-[15px]">{children}</Block>;
}
