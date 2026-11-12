// Home's notice that payments wait in the Inbox (an import brought them in); tap to review them.
import { useQuery } from '@tanstack/react-query';
import { inboxQueries } from '../../models/inbox';

export function InboxNotice({ onOpen }: { onOpen: () => void }) {
  const { data: waiting } = useQuery(inboxQueries.count());
  if (!waiting) return null;
  return (
    <section className="mx-4 mt-5" aria-label="Inbox">
      <button
        type="button"
        onClick={onOpen}
        className="panel flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-3 text-left active:opacity-80 dark:bg-raised"
      >
        <span>
          <span className="block text-[15px] font-bold">
            {waiting} payment{waiting === 1 ? '' : 's'} to review
          </span>
          <span className="block text-[13px] text-muted">Nothing is saved until you say so.</span>
        </span>
        <span aria-hidden="true">▸</span>
      </button>
    </section>
  );
}
