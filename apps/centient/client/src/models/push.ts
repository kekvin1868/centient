// Bill reminders by Web Push: whether the server can send them, whether this browser is subscribed, and turning
// them on and off here. The subscription lives in the browser (its service worker) and is mirrored to the server.
import { queryOptions } from '@tanstack/react-query';
import { call, client } from './api';

/** This browser's service worker, if it has one (development builds do not register it). */
const worker = async () =>
  'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
const keyBytes = (base64url: string) =>
  Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export const pushQueries = {
  all: () => ['push'] as const,
  /** The server's side: `available` is false until it has its push keys. */
  server: () =>
    queryOptions({
      queryKey: [...pushQueries.all(), 'server'],
      queryFn: () => call(client.api.push.$get()),
    }),
  /** This browser's side. Never kept between visits: it is a fact about the browser, not the account. */
  device: () =>
    queryOptions({
      queryKey: [...pushQueries.all(), 'device'],
      staleTime: 0,
      gcTime: 0,
      queryFn: async () => {
        const reg = await worker();
        return {
          /** False in a browser tab on iPhone: push exists there only for the Home Screen app. */
          canPush: 'PushManager' in window && 'Notification' in window,
          hasWorker: Boolean(reg),
          subscribed: Boolean(await reg?.pushManager?.getSubscription()),
        };
      },
    }),
};

type Server = { available: boolean };
type Device = { canPush: boolean; hasWorker: boolean };

/** Why reminders can't be turned on here, in the words the row shows; null when they can. */
export function pushBlocker(server: Server, device: Device): string | null {
  if (!server.available) return 'Not set up on this server yet.';
  if (!device.canPush)
    return 'On iPhone, add Centient to the Home Screen first (Share, then Add to Home Screen) and open it from there.';
  if (!device.hasWorker) return 'Needs the installed app; this is a development build.';
  return null;
}

export const pushApi = {
  /** Asks the phone for permission (this must come from a tap), subscribes this browser and tells the server. */
  async turnOn(publicKey: string) {
    const reg = await worker();
    if (!reg) throw new Error('Reminders need the installed app');
    if ((await Notification.requestPermission()) !== 'granted')
      throw new Error(
        "Notifications are blocked for Centient. Allow them in the phone's settings.",
      );
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('The phone gave no address');
    await call(
      client.api.push.subscribe.$post({
        json: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      }),
    );
  },

  async turnOff() {
    const subscription = await (await worker())?.pushManager.getSubscription();
    if (!subscription) return;
    await call(client.api.push.unsubscribe.$post({ json: { endpoint: subscription.endpoint } }));
    await subscription.unsubscribe();
  },

  /** Sends "Reminders are on" to every device of yours; resolves with how many it reached. */
  test: () => call(client.api.push.test.$post()),
};
