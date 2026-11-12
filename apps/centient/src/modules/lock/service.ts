// App lock use cases: turn it on by registering a passkey, unlock with it, lock again, turn it off, and the
// way back in when the passkey is lost. The lock is per user; while it is on, middleware/init.ts refuses
// every other /api request from a browser without a live unlock session.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { DomainError } from '../../domain/ledger';
import type { Identity } from '../../middleware/auth';
import type { Repos } from '../../middleware/init';

/** The site a ceremony runs on: its host (the passkey's "relying party") and its origin. */
export type Site = { host: string; origin: string };

const SESSION_HOURS = 12;
const CHALLENGE_MINUTES = 5;
// Lost passkey: only a sign-in this fresh may reset the lock, so holding an unlocked phone is not enough.
const FRESH_SIGN_IN_MINUTES = 5;

export function createLockService({
  userId,
  email,
  now,
  repos,
}: {
  userId: string;
  email: string;
  now: () => number;
  repos: Repos;
}) {
  const at = (ms = 0) => new Date(now() + ms).toISOString();

  async function status(sessionId?: string) {
    const s = await repos.lock.state(userId, sessionId ?? '', at());
    return { enabled: s.passkeys > 0, unlocked: s.passkeys === 0 || s.session };
  }
  async function mustBeUnlocked(sessionId?: string) {
    if (!(await status(sessionId)).unlocked)
      throw new DomainError('LOCKED', 'Unlock Centient first');
  }
  /**
   * Keeps the ceremony's challenge and hands the options on without `extensions`: none is used, and its types
   * (binary buffers) have no JSON form for the typed client.
   */
  async function issue<T extends { challenge: string; extensions?: unknown }>(options: T) {
    await repos.lock.setChallenge(userId, options.challenge, at(CHALLENGE_MINUTES * 60_000));
    const { extensions: _unused, ...sent } = options;
    return sent;
  }
  async function challengeFor(what: string) {
    const challenge = await repos.lock.takeChallenge(userId, at());
    if (!challenge) throw new DomainError('LOCK_EXPIRED', `That took too long. ${what} again.`);
    return challenge;
  }
  const startSession = () => repos.lock.startSession(userId, at(), at(SESSION_HOURS * 3600_000));

  return {
    status,

    /** Step 1 of turning the lock on (or adding this device): what the browser needs to make a passkey. */
    async registerOptions(site: Site, sessionId?: string) {
      await mustBeUnlocked(sessionId);
      const options = await generateRegistrationOptions({
        rpName: 'Centient',
        rpID: site.host,
        userName: email,
        attestationType: 'none',
        excludeCredentials: (await repos.lock.passkeys(userId)).map(p => ({ id: p.id })),
        // The device itself (Face ID, fingerprint, screen lock), and it must check who is holding it.
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
      });
      return issue(options);
    },

    /** Step 2: checks the new passkey and keeps it; this browser is unlocked from here. Returns its session id. */
    async register(site: Site, response: RegistrationResponseJSON, sessionId?: string) {
      await mustBeUnlocked(sessionId);
      const expectedChallenge = await challengeFor('Turn it on');
      const checked = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: site.origin,
        expectedRPID: site.host,
        requireUserVerification: true,
      }).catch(() => null);
      if (!checked?.verified)
        throw new DomainError('PASSKEY_REFUSED', "That passkey couldn't be checked");
      const { credential } = checked.registrationInfo;
      await repos.lock.addPasskey(userId, {
        id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
      });
      return startSession();
    },

    /** Step 1 of unlocking: the challenge, for one of this user's passkeys. */
    async challenge(site: Site) {
      const passkeys = await repos.lock.passkeys(userId);
      if (!passkeys.length) throw new DomainError('LOCK_OFF', 'The lock is not on');
      const options = await generateAuthenticationOptions({
        rpID: site.host,
        allowCredentials: passkeys.map(p => ({ id: p.id })),
        userVerification: 'required',
      });
      return issue(options);
    },

    /** Step 2: checks the answer against the passkey; returns the new session's id. */
    async unlock(site: Site, response: AuthenticationResponseJSON) {
      const passkey = (await repos.lock.passkeys(userId)).find(p => p.id === response.id);
      if (!passkey) throw new DomainError('PASSKEY_REFUSED', "That passkey isn't this lock's");
      const expectedChallenge = await challengeFor('Unlock');
      const checked = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: site.origin,
        expectedRPID: site.host,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: isoBase64URL.toBuffer(passkey.public_key),
          counter: passkey.counter,
        },
      }).catch(() => null);
      if (!checked?.verified)
        throw new DomainError('PASSKEY_REFUSED', "That passkey couldn't be checked");
      await repos.lock.setCounter(passkey.id, checked.authenticationInfo.newCounter);
      return startSession();
    },

    /** Locks this browser again (the app does it after a while in the background). */
    async lock(sessionId?: string) {
      if (sessionId) await repos.lock.endSession(userId, sessionId);
    },

    /** Turns the lock off for the user: every passkey and session goes. */
    async turnOff(sessionId?: string) {
      await mustBeUnlocked(sessionId);
      await repos.batch(repos.lock.clearStatements(userId));
    },

    /**
     * Lost passkey: turns the lock off without it, but only right after signing in again through Cloudflare
     * Access (a service token or the development sign-in never counts as that).
     */
    async reset(identity: Identity) {
      const fresh =
        identity.via === 'access' &&
        identity.signedInAt !== null &&
        now() - identity.signedInAt <= FRESH_SIGN_IN_MINUTES * 60_000;
      if (!fresh)
        throw new DomainError(
          'SIGN_IN_AGAIN',
          `Sign out of Centient and in again, then reset within ${FRESH_SIGN_IN_MINUTES} minutes`,
        );
      await repos.batch(repos.lock.clearStatements(userId));
    },
  };
}
