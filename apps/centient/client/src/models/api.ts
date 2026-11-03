// The API's types, named straight from the Worker's routes (Hono RPC): change a route's response on the server
// and every model that names it fails `npm run typecheck`. Nothing outside models/ imports from server folders.
export type { InferRequestType as Req, InferResponseType as Res } from 'hono/client';
export { call, client } from '../lib/api';
