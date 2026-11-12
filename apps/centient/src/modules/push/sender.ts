// Sends Web Push messages: each is encrypted for one browser (RFC 8291) and signed with this server's VAPID
// keys (RFC 8292) by @block65/webcrypto-web-push, then posted to that browser's push service.
import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';
import type { Note } from '../../domain/reminders';
import type { Subscription } from '../../repos/push';

export type Vapid = { subject: string; publicKey: string; privateKey: string };
export type Sender = ReturnType<typeof createSender>;

/** The server's VAPID keys from its settings, or null when push is not set up (reminders are then off). */
export function vapidOf(env: {
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}): Vapid | null {
  const {
    VAPID_SUBJECT: subject,
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
  } = env;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

// A reminder still matters a day late; after that the next one is on its way.
const TTL_SECONDS = 24 * 3600;

export function createSender(vapid: Vapid, fetch: typeof globalThis.fetch) {
  const keys: VapidKeys = vapid;
  return {
    publicKey: vapid.publicKey,

    /**
     * Sends the note to each subscription. Returns the endpoints the push service says are gone (404 / 410),
     * for the caller to forget. Any other failure is logged and skipped: one bad phone must not stop the rest.
     */
    async send(subscriptions: Subscription[], note: Note & { url: string }): Promise<string[]> {
      const gone: string[] = [];
      for (const s of subscriptions) {
        try {
          const payload = await buildPushPayload(
            { data: note, options: { ttl: TTL_SECONDS } },
            {
              endpoint: s.endpoint,
              expirationTime: null,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            keys,
          );
          const res = await fetch(s.endpoint, payload);
          if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
          else if (!res.ok) console.warn(`push refused: ${res.status} ${new URL(s.endpoint).host}`);
        } catch (e) {
          console.warn(`push failed: ${e instanceof Error ? e.message : e}`);
        }
      }
      return gone;
    },
  };
}
