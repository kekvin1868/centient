// The Subscriptions screen, downloaded the first time it opens (Home and Money both open it).
import { lazySheet } from '../../ui/lazySheet';

export const SubscriptionsLazy = lazySheet(() =>
  import('./Subscriptions').then(m => m.Subscriptions),
);
