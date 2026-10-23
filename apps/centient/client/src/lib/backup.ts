// Downloads everything in the workspace as one JSON file (centient-backup-YYYY-MM-DD.json).
import { call, client } from './api';
import { me } from './state';

export async function downloadBackup(): Promise<void> {
  const data = await call(client.api.backup.$get());
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `centient-backup-${me.value?.today ?? new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
