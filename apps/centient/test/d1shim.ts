// A D1-shaped wrapper over Node's built-in SQLite (D1 is SQLite), for fast integration tests.
// ponytail: covers only the D1 calls the repositories use (prepare/bind/first/all/run/batch).
import { DatabaseSync } from 'node:sqlite';

export function testD1(migrationSql: string): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys; match it
  db.exec(migrationSql);
  const statement = (sql: string) => {
    let args: unknown[] = [];
    const exec = () => {
      const st = db.prepare(sql);
      if (st.columns().length) return { results: st.all(...(args as never[])), meta: { changes: 0 } };
      return { results: [], meta: { changes: Number(st.run(...(args as never[])).changes) } };
    };
    const s = {
      bind(...a: unknown[]) { args = a.map(v => (v === undefined ? null : v)); return s; },
      async first() { return (db.prepare(sql).get(...(args as never[])) as unknown) ?? null; },
      async all() { return exec(); },
      async run() { return exec(); },
      exec,
    };
    return s;
  };
  return {
    prepare: statement,
    // D1 runs a batch as one transaction.
    async batch(stmts: ReturnType<typeof statement>[]) {
      db.exec('BEGIN');
      try { const out = stmts.map(s => s.exec()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  } as unknown as D1Database;
}
