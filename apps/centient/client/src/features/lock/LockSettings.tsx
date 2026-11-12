// Settings' "App lock" group. Off: turn it on (the phone makes a passkey). On: how long away before it locks
// again (kept on this device), lock now, turn it off.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LOCK_AFTER, loadLockAfter, saveLockAfter } from '../../lib/lockState';
import { attempt } from '../../lib/run';
import { lockApi, lockQueries } from '../../models/lock';
import { queryClient } from '../../models/query';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { PickerRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { showToast } from '../../ui/Toast';

const AWAY = LOCK_AFTER.map(m => ({
  value: String(m),
  label: m === 0 ? 'Any time' : `${m} minute${m === 1 ? '' : 's'}`,
}));
// Passkeys exist only on https (or this machine's own localhost) in a browser that knows them.
const canLock = () => window.isSecureContext && 'PublicKeyCredential' in window;

export function LockSettings() {
  const { data } = useQuery(lockQueries.status());
  const [after, setAfter] = useState(loadLockAfter);
  const [confirm, setConfirm] = useState(false);
  if (!data) return null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: lockQueries.all() });
  const run = async (action: () => Promise<unknown>, done: string) => {
    if (!(await attempt(action))) return;
    await refresh();
    showToast(done);
  };

  return (
    <>
      <Group
        label="App lock"
        foot={
          data.enabled
            ? 'Lost the passkey? The lock screen has "Can\'t unlock?": sign out, sign in again and reset it there.'
            : 'Asks for Face ID, a fingerprint or the screen lock when Centient opens. It is a privacy screen for a phone that is already signed in.'
        }
      >
        {!data.enabled ? (
          <Row
            title="Turn on app lock"
            sub={canLock() ? undefined : 'Needs an https address and a device with a screen lock'}
            onClick={canLock() ? () => run(lockApi.turnOn, 'App lock is on') : undefined}
            chevron
          />
        ) : (
          <>
            <PickerRow
              label="Lock when away for"
              value={String(after)}
              options={AWAY}
              onChange={v => {
                if (v === null) return;
                saveLockAfter(Number(v));
                setAfter(Number(v));
              }}
            />
            <Row title="Lock now" onClick={() => attempt(lockApi.lock)} />
            <Row
              title={<span className="k-color-brand-red text-primary">Turn off app lock</span>}
              onClick={() => setConfirm(true)}
            />
          </>
        )}
      </Group>
      <ConfirmSheet
        open={confirm}
        message="Turn off the app lock? Centient will open without asking."
        confirmLabel="Turn off"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void run(lockApi.turnOff, 'App lock is off');
        }}
      />
    </>
  );
}
