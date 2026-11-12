// Settings' "Reminders" group: a switch for bill reminders on this device (a notification 3 days before a bill
// is due and on the day), and "Send a test" once it is on. When they can't be turned on here, the row says why.
import { useQuery } from '@tanstack/react-query';
import { attempt } from '../../lib/run';
import { pushApi, pushBlocker, pushQueries } from '../../models/push';
import { queryClient } from '../../models/query';
import { ToggleRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { showToast } from '../../ui/Toast';

export function PushSettings() {
  const { data: server } = useQuery(pushQueries.server());
  const { data: device } = useQuery(pushQueries.device());
  if (!server || !device) return null;
  const blocker = pushBlocker(server, device);
  const { publicKey } = server;

  const set = async (on: boolean) => {
    if (!publicKey) return;
    const done = await attempt(() => (on ? pushApi.turnOn(publicKey) : pushApi.turnOff()));
    await queryClient.invalidateQueries({ queryKey: pushQueries.device().queryKey });
    if (done) showToast(on ? 'Reminders are on' : 'Reminders are off');
  };
  const test = () =>
    attempt(async () => {
      const { sent } = await pushApi.test();
      showToast(sent ? `Sent to ${sent} device${sent === 1 ? '' : 's'}` : 'No device to send to');
    });

  return (
    <Group
      label="Reminders"
      foot={
        blocker
          ? undefined
          : 'A notification 3 days before a bill is due and on the day, around 08:00. Bills are under Money, Subscriptions.'
      }
    >
      {blocker ? (
        <Row title="Bill reminders" sub={blocker} />
      ) : (
        <ToggleRow label="Bill reminders" checked={device.subscribed} onChange={set} />
      )}
      {device.subscribed && <Row title="Send a test" onClick={test} />}
    </Group>
  );
}
