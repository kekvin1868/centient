// Quick-add words the user taught the parser (merchant, account, category).
import { all } from './sql';

export type Alias = { alias: string; kind: 'MERCHANT' | 'ACCOUNT' | 'CATEGORY'; value: string };

export function aliasesRepo(db: D1Database) {
  return {
    list(ws: string) {
      return all<Alias>(db, 'SELECT alias, kind, value FROM aliases WHERE workspace_id = ?', ws);
    },

    async save(ws: string, a: Alias) {
      await db.prepare('INSERT INTO aliases (workspace_id, alias, kind, value) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id, alias, kind) DO UPDATE SET value = excluded.value')
        .bind(ws, a.alias, a.kind, a.value).run();
    },
  };
}
