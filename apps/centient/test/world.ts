// Test wiring: the production factories (createRepos, createServices) over the SQLite D1 shim.
import { createRepos, createServices } from '../src/middleware/init';
import type { FileStore } from '../src/repos/files';
import { migrationsSql, testD1 } from './d1shim';

export type World = ReturnType<typeof world>;

export function world(o: { db?: D1Database; now: () => number; store?: FileStore; fetch?: typeof fetch }) {
  const db = o.db ?? testD1(migrationsSql());
  const repos = createRepos(db, o.store);
  // Fresh services per call, like one per request in production.
  const svc = (ws: string) => createServices({ repos, ws, now: o.now, fetch: o.fetch ?? (() => Promise.reject(new Error('no network in tests'))) });
  return { db, repos, svc };
}
