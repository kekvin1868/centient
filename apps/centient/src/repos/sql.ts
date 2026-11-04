// Small SQL helpers shared by the repos. Every query filters on workspace_id: D1 has no row-level
// security, so this is the wall between workspaces.

export const uid = () => crypto.randomUUID();

export async function all<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}

/** The UPDATE that patches only the `allowed` columns of one row in this workspace; null when nothing to patch. */
export function updateStatement(
  db: D1Database,
  table: string,
  allowed: string[],
  ws: string,
  id: string,
  patch: Record<string, unknown>,
  extraWhere = '',
): D1PreparedStatement | null {
  const cols = Object.keys(patch).filter(k => allowed.includes(k));
  if (!cols.length) return null;
  return db
    .prepare(
      `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND workspace_id = ?${extraWhere}`,
    )
    .bind(...cols.map(c => patch[c] ?? null), id, ws);
}

/** Patches only the `allowed` columns of one row in this workspace; false when no row matched. */
export async function updateColumns(...args: Parameters<typeof updateStatement>): Promise<boolean> {
  const stmt = updateStatement(...args);
  return stmt ? (await stmt.run()).meta.changes > 0 : true;
}
