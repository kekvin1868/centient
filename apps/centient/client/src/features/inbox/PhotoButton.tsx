// "From a photo" under the log box: pick or take a picture of a receipt or a payment screen. Its text is read
// on this phone (lib/ocr, loaded on first use), sent to the server's rules, and the draft waits in the Inbox.
import { Camera } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { errorText } from '../../lib/run';
import { selectedAccount } from '../../lib/state';
import { inboxApi, inboxQueries } from '../../models/inbox';
import { persist } from '../../models/query';
import { showToast } from '../../ui/Toast';

export function PhotoButton({ onCaptured }: { onCaptured: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  /** How far the reading is (0..1); null while idle. */
  const [progress, setProgress] = useState<number | null>(null);

  const read = async (photo: File | undefined) => {
    if (!photo) return;
    setProgress(0);
    try {
      const { readPhoto, photoHash } = await import('../../lib/ocr');
      const [rawText, contentHash] = await Promise.all([
        readPhoto(photo, setProgress),
        photoHash(photo),
      ]);
      const saved = await persist(
        () =>
          inboxApi.capture({
            source: 'UPLOAD',
            rawText,
            contentHash,
            accountId: selectedAccount.value,
          }),
        [inboxQueries.all()],
        e =>
          showToast(
            'code' in e && e.code === 'DUPLICATE'
              ? 'That photo is already in the Inbox'
              : errorText(e),
          ),
      );
      if (saved) onCaptured();
    } catch {
      showToast("That photo couldn't be read");
    } finally {
      setProgress(null);
      // The same picture can be picked again (the input only fires when its value changes).
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="mx-5 mt-2.5">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Photo of a receipt"
        onChange={e => void read(e.target.files?.[0])}
      />
      <button
        type="button"
        className="keycap keycap-quiet"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        <span className="flex items-center gap-1.5" role={progress === null ? undefined : 'status'}>
          <Camera size={18} weight="bold" aria-hidden="true" />
          {progress === null ? 'From a photo' : `Reading the photo… ${Math.round(progress * 100)}%`}
        </span>
      </button>
    </div>
  );
}
