// The small "was Abang" / "archived" stickers on a person's tab: shown for 2 days after the event, then gone.
// Only people tabs (kind IOU) get them for now; the old names of every account are saved server-side already.
export const STICKER_MS = 2 * 24 * 60 * 60 * 1000;

type Person = {
  kind: string;
  archived_at: string | null;
  formerNames?: { name: string; at: string }[];
};

/** The stickers a person's name row shows at `now` (ms): "was <old name>" after a rename, "archived" after hiding. */
export function stickersOf(a: Person | undefined, now = Date.now()): string[] {
  if (!a || a.kind !== 'IOU') return [];
  const fresh = (iso: string) => now - Date.parse(iso) < STICKER_MS;
  const out: string[] = [];
  const last = a.formerNames?.[0];
  if (last && fresh(last.at)) out.push(`was ${last.name}`);
  if (a.archived_at && fresh(a.archived_at)) out.push('archived');
  return out;
}
