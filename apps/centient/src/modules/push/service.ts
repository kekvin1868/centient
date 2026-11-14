// Push use cases for the signed-in person: turn bill reminders on for this browser, off again, and send a
// test. The reminders themselves go out from the daily cron (src/cron.ts).
import { DomainError } from '../../domain/ledger';
import type { Repos } from '../../middleware/init';
import type { Subscription } from '../../repos/push';
import type { Sender } from './sender';

// The push services of the browsers this app runs in. An endpoint is an address this server will post to, so
// it is never taken on trust.
const PUSH_HOSTS = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
];
/** "Send a test" tries per person, for good: each one is a request against the free plan's daily limits. */
export const PUSH_TESTS = 3;
const testsLeft = (used: number) => Math.max(0, PUSH_TESTS - used);

const knownHost = (endpoint: string) => {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return (
      protocol === 'https:' && PUSH_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
};

export function createPushService({
  userId,
  repos,
  sender,
}: {
  userId: string;
  repos: Repos;
  /** null = this server has no VAPID keys: reminders are not available. */
  sender: Sender | null;
}) {
  const ready = () => {
    if (!sender) throw new DomainError('PUSH_OFF', "Reminders aren't set up on this server yet");
    return sender;
  };

  return {
    /** Whether reminders can be turned on, the key a browser subscribes with, and the tests left. */
    info: async () => ({
      available: sender !== null,
      publicKey: sender?.publicKey ?? null,
      testsLeft: testsLeft(await repos.push.testsUsed(userId)),
    }),

    async subscribe(s: Subscription) {
      ready();
      if (!knownHost(s.endpoint))
        throw new DomainError('PUSH_ENDPOINT', "That isn't a push service this app knows");
      await repos.push.save(userId, s);
    },

    unsubscribe: (endpoint: string) => repos.push.remove(userId, endpoint),

    /**
     * Sends "Reminders are on" to every browser of this person and uses up one test; says how many browsers it
     * reached and the tests left. With no browser to send to, nothing is sent and no test is used.
     */
    async test() {
      ready();
      const subscriptions = await repos.push.ofUser(userId);
      if (!subscriptions.length)
        return { sent: 0, testsLeft: testsLeft(await repos.push.testsUsed(userId)) };
      const used = await repos.push.useTest(userId, PUSH_TESTS);
      if (used === null)
        throw new DomainError('PUSH_TESTS_USED', `You've used all ${PUSH_TESTS} tests`);
      const gone = await ready().send(subscriptions, {
        title: 'Reminders are on',
        body: 'Centient will tell you 3 days before a bill is due, and on the day.',
        tag: 'test',
        url: '/',
      });
      await repos.push.forget(gone);
      return { sent: subscriptions.length - gone.length, testsLeft: testsLeft(used) };
    },
  };
}
