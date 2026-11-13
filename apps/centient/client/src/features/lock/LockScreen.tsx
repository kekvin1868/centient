// The lock screen: all of the app is behind it. Unlock asks the phone for the passkey (Face ID, fingerprint or
// the screen lock). "Can't unlock?" explains the way back in when the passkey is lost.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { OfflineError } from '../../lib/api';
import { attempt } from '../../lib/run';
import { lockApi } from '../../models/lock';
import { Logo } from '../../ui/Logo';
import { showToast } from '../../ui/Toast';

export function LockScreen() {
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    // The phone's own passkey errors are long and technical (and a cancel is one of them), so they get one plain line.
    await lockApi
      .unlock()
      .catch(e =>
        showToast(
          e instanceof OfflineError
            ? 'No connection. Try again in a moment.'
            : "That didn't unlock it. Try again.",
        ),
      );
    setBusy(false);
  };
  return (
    <main className="screen flex min-h-dvh flex-col items-center justify-center text-center">
      <h1>
        <Logo height={45} className="text-ink" />
      </h1>
      <p className="mt-6 text-[17px]">Centient is locked.</p>
      <Block className="w-full max-w-sm">
        <Button large rounded disabled={busy} onClick={unlock} autoFocus>
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
      </Block>
      <details className="mx-6 max-w-sm text-left text-[15px] text-muted">
        <summary className="cursor-pointer text-center underline">Can't unlock?</summary>
        <p className="mt-3">
          If this phone no longer has the passkey: sign out, sign in again, then tap Reset the lock
          within five minutes. That turns the lock off; your data stays.
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          <Button large rounded tonal onClick={() => location.assign('/cdn-cgi/access/logout')}>
            Sign out
          </Button>
          <Button large rounded tonal onClick={() => attempt(lockApi.reset)}>
            Reset the lock
          </Button>
        </div>
      </details>
    </main>
  );
}
