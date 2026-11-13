// The Inbox, downloaded the first time it opens (Home opens it from its notice).
import { lazySheet } from '../../ui/lazySheet';

export const InboxLazy = lazySheet(() => import('./InboxSheet').then(m => m.InboxSheet));
