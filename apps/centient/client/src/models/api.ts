// The API's types, named straight from the Worker's routes (Hono RPC): change a route's response on the server
// and every model that names it fails `npm run typecheck`. Nothing outside models/ calls the API or imports from
// server folders.
import type { InferRequestType } from 'hono/client';
import { call, client } from '../lib/api';

export type { InferRequestType as Req, InferResponseType as Res } from 'hono/client';
export { call, client };

/** The PATCH body every catalog table takes (a whitelist per table on the server). */
export type RowPatch = InferRequestType<(typeof client.api.accounts)[':id']['$patch']>['json'];

/** Renames, hides (`archived`) or changes one field of an account, pocket or category. */
export const patchRow = (
  table: 'accounts' | 'envelopes' | 'categories',
  id: string,
  json: RowPatch,
) =>
  // ponytail: one body type for all three; a pocket's own `kind` (Spending / Savings) goes through pocketApi.update.
  call(
    (client.api[table][':id'] as (typeof client.api.accounts)[':id']).$patch({
      param: { id },
      json,
    }),
  );
