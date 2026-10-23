// Private files (proof of payment): bytes in R2, metadata in the attachments table.

/** Where the bytes live: R2 in production and dev, a Map in tests. */
export interface FileStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null>;
}

export const r2Files = (bucket: R2Bucket): FileStore => ({
  async put(key, body, contentType) {
    await bucket.put(key, body, { httpMetadata: { contentType } });
  },
  async get(key) {
    const o = await bucket.get(key);
    return o ? { body: o.body, contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null;
  },
});

export type Attachment = { id: string; r2_key: string; filename: string; content_type: string; size: number };

export function filesRepo(db: D1Database, store?: FileStore) {
  const bytes = () => {
    if (!store) throw new Error('file store not configured');
    return store;
  };
  return {
    put: (key: string, body: ArrayBuffer, contentType: string) => bytes().put(key, body, contentType),
    read: async (key: string) => (store ? store.get(key) : null),

    async create(ws: string, a: Attachment) {
      await db.prepare('INSERT INTO attachments (id, workspace_id, r2_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(a.id, ws, a.r2_key, a.filename, a.content_type, a.size).run();
    },

    get(ws: string, id: string) {
      return db.prepare('SELECT id, r2_key, filename, content_type, size FROM attachments WHERE id = ? AND workspace_id = ?').bind(id, ws).first<Attachment>();
    },
  };
}
