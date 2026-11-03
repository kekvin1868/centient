// Categories (spending and income). Saves refresh everything: a rename or a merge shows in every list.
import { call, client, patchRow, type Req, type RowPatch } from './api';

type NewCategory = Req<typeof client.api.categories.$post>['json'];

export const categoryApi = {
  create: (json: NewCategory) => call(client.api.categories.$post({ json })),
  update: (id: string, json: RowPatch) => patchRow('categories', id, json),
  /** Deletes it, moving its entries, budgets and words to `moveTo`. */
  remove: (id: string, moveTo: string) =>
    call(client.api.categories[':id'].$delete({ param: { id }, json: { moveTo } })),
};
