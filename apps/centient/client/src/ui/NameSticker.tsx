// A small sticker next to a person's name: "was Abang", "archived". Nothing renders when there are none.
export function NameSticker({ stickers }: { stickers: string[] }) {
  if (!stickers.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {stickers.map(s => (
        <span
          key={s}
          className="rounded-[4px] border border-edge bg-[var(--miku)] px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-[#0b0f0f]"
        >
          {s}
        </span>
      ))}
    </span>
  );
}
