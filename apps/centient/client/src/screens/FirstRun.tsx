// First open: one card, then straight to Home. No tour.
import { AccountForm } from '../components/AccountForm';

export function FirstRun({ onDone }: { onDone: () => void }) {
  return (
    <main className="screen pb-10">
      <h1 className="screen-title">Welcome to Centient</h1>
      <p className="mx-4 opacity-60">Add the account you pay with most. You can add the rest later.</p>
      <AccountForm onDone={onDone} submitLabel="Start" />
    </main>
  );
}
