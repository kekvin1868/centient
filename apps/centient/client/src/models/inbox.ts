// The Inbox (payments waiting for your OK, from an import or a photo): what the API sends, how it loads and saves. Home reads the count,
// so this file stays small; turning a spreadsheet into payments is ./import.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

type List = Res<typeof client.api.inbox.$get>;
/** One payment waiting for review; `suggested` is a saved entry it looks like. */
export type InboxItem = List['items'][number];
export type InboxImport = List['imports'][number];
export type ImportRow = Req<typeof client.api.inbox.import.$post>['json']['rows'][number];
type Capture = Req<typeof client.api.inbox.capture.$post>['json'];
type AddBody = Req<(typeof client.api.inbox)[':id']['add']['$post']>['json'];
type Patch = Req<(typeof client.api.inbox)[':id']['$patch']>['json'];
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
  /** The text read off a photo becomes a draft waiting for review (the same photo twice: `DUPLICATE`). */
  capture: (json: Capture) => call(client.api.inbox.capture.$post({ json })),
  /** Sets the category a payment will get, or the account a photo is for. */
  update: (id: string, json: Patch) => call(one.$patch({ param: { id }, json })),
  /** The payment becomes a new entry (`command`: the entry as corrected in the form); a balance check sets the balance. */
  add: (id: string, command?: AddBody['command']) =>
    call(one.add.$post({ param: { id }, json: { command } })),
  /** The payment is the entry that was suggested; nothing new is saved. */
  link: (id: string) => call(one.link.$post({ param: { id } })),
  dismiss: (id: string) => call(one.dismiss.$post({ param: { id } })),
  /** Every waiting payment without a suggested entry becomes an entry. */
  addAll: () => call(client.api.inbox['add-all'].$post({ json: {} })),
  undoImport: (id: string) => call(client.api.inbox.imports[':id'].$delete({ param: { id } })),
};
