// Runs a user action and shows any failure as a toast in the server's plain words.
import { showToast } from '../ui/Toast';
import { OfflineError } from './api';

/** A failure in the words the user sees: the server's message, or a hint when offline. */
export const errorText = (e: unknown) =>
  e instanceof OfflineError ? 'No connection. Try again in a moment.' : (e as Error).message;

export async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    showToast(errorText(e));
    return false;
  }
}
