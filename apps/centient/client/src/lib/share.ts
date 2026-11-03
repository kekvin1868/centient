// Hands a file to the share sheet (Print, Save to Files, Numbers…) where the browser can share files, else downloads
// it. Step 1 found the iPhone Home Screen app can't print and that a download there restarts the app on closing, so
// exports go through here (Q42). iOS shares only right after a tap: when making the file took too long it refuses,
// and the caller offers a second tap with the file ready (Q40).
export type Shared = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

export async function shareFile(file: File): Promise<Shared> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError') return 'needs-tap';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
