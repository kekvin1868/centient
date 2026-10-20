// First open: one card, then straight to Home. No tour.
import { AccountForm } from '../components/AccountForm';

export function FirstRun({ onDone }: { onDone: () => void }) {
  return (
    <main class="screen" style="padding-bottom:40px">
      <h1 class="title">Welcome to Centient</h1>
      <p class="muted" style="margin:-6px 4px 24px">Add the account you pay with most. You can add the rest later.</p>
      <AccountForm onDone={onDone} submitLabel="Start" />
    </main>
  );
}
