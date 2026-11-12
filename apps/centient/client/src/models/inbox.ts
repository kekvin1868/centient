// The Inbox (payments waiting for your OK): what the API sends, how it loads and saves. Home reads the count,
// so this file stays small; turning a spreadsheet into payments is ./import.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

type List = Res<typeof client.api.inbox.$get>;
/** One payment waiting for review; `suggested` is a saved entry it looks like. */
export type InboxItem = List['items'][number];
export type InboxImport = List['imports'][number];
export type ImportRow = Req<typeof client.api.inbox.import.$post>['json']['rows'][number];
const one = client.api.inbox[':id'];

export const inboxQueries = {
  all: () => ['inbox'] as const,
  list: () =>
    queryOptions({
      queryKey: [...inboxQueries.all(), 'list'],
      queryFn: () => call(client.api.inbox.$get()),
    }),
  /** How many wait, for Home (the list itself loads when the Inbox opens). */
  count: () =>
    queryOptions({
      queryKey: [...inboxQueries.all(), 'count'],
      queryFn: async () => (await call(client.api.inbox.count.$get())).waiting,
    }),
};

export const inboxApi = {
  import: (rows: ImportRow[]) => call(client.api.inbox.import.$post({ json: { rows } })),
  setCategory: (id: string, categoryId: string | null) =>
    call(one.$patch({ param: { id }, json: { categoryId } })),
  /** The payment becomes a new entry. */
  add: (id: string) => call(one.add.$post({ param: { id } })),
  /** The payment is the entry that was suggested; nothing new is saved. */
  link: (id: string) => call(one.link.$post({ param: { id } })),
  dismiss: (id: string) => call(one.dismiss.$post({ param: { id } })),
  /** Every waiting payment without a suggested entry becomes an entry. */
  addAll: () => call(client.api.inbox['add-all'].$post({ json: {} })),
  undoImport: (id: string) => call(client.api.inbox.imports[':id'].$delete({ param: { id } })),
};
