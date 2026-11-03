// Our own warning popup (never the browser's alert): a message and one OK button, in the confirm dialog's look.
import { createPortal } from 'react-dom';
import { NightSheet } from './night/NightSheet';
import { usePresence } from './night/tv';

export function NoticeSheet({ message, onClose }: { message: string | null; onClose: () => void }) {
  const { mounted, gen, unmount } = usePresence(message !== null);
  if (!mounted) return null;
  return createPortal(
    <NightSheet key={gen} fixed open={message !== null} place="mid" fx="glitch" label={message ?? ''} title="WARNING"
      onClose={() => { unmount(); onClose(); }}>
      {close => (
        <>
          <p className="c-msg">{message}</p>
          <div className="k-acts" style={{ gridTemplateColumns: '1fr' }}>
            <button type="button" className="n-go" onClick={close}>OK</button>
          </div>
        </>
      )}
    </NightSheet>,
    document.body,
  );
}
