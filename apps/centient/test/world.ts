// Test wiring: the production factories (createRepos, createServices) over the SQLite D1 shim.
import { createRepos, createServices } from '../src/middleware/init';
import type { FileStore } from '../src/repos/files';
import { migrationsSql, testD1 } from './d1shim';

export type World = ReturnType<typeof world>;

export function world(o: {
  db?: D1Database;
  now: () => number;
  store?: FileStore;
  fetch?: typeof fetch;
}) {
  const db = o.db ?? testD1(migrationsSql());
  const repos = createRepos(db, o.store);
  // Fresh services per call, like one per request in production. `user` matters only to what is per person
  // (the app lock, delete account); tests of those pass the real one.
  const svc = (ws: string, user = { id: 'nobody', email: 'nobody@test' }) =>
    createServices({
      repos,
      ws,
      user,
      now: o.now,
      fetch: o.fetch ?? (() => Promise.reject(new Error('no network in tests'))),
    });
  return { db, repos, svc };
}
