// R2 adapter for the FileStore port: private files (proof of payment), read back only through the Worker.
import type { FileStore } from '../application/ports';

export class R2Files implements FileStore {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, body: ArrayBuffer, contentType: string) {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async get(key: string) {
    const o = await this.bucket.get(key);
    return o ? { body: o.body, contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null;
  }
}
