// A card or pay later bill on Home's "Coming up", drawn as an old parchment scroll between two wooden rods (left
// and right) that ages with every bill left unpaid in a row (`unpaidBills`): 1 = fresh yellow, 2 = crumpled,
// 3 or more = torn and worn. Its moves, with motion's `animate` (the look is CSS, .bill-scroll in styles.css):
// - it unrolls the first time it shows in a visit: the rods start together in the middle and spring apart;
// - a tap blinks it twice (hard on / off, 8-bit), then opens the Bills tab;
// - when it is older than the last time this phone showed it, it shows the old look, then crumples into the new
//   one (the torn edges are polygons with the same points at every age, so the edge itself tears).
// Nothing moves with "reduce motion" on. Loaded after Home's first paint (ComingUp), like the tap-only sheets.
import { animate } from 'motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion } from '../../lib/motion';

const AGE_WORDS = ['', 'This bill', '2 bills unpaid', '3+ bills unpaid'];
const EASE_OUT = [0.2, 1.25, 0.4, 1] as const; // a little past open, then back: the rods' spring

/** Scrolls already unrolled in this visit: each unrolls once per app open. */
const unrolled = new Set<string>();
const AGE_KEY = (id: string) => `scroll-age:${id}`;
function seenAge(id: string) {
  try {
    return Number(localStorage.getItem(AGE_KEY(id))) || 0;
  } catch {
    return 0;
  }
}
function keepAge(id: string, age: number) {
  try {
    localStorage.setItem(AGE_KEY(id), String(age));
  } catch {
    /* a private window: the moment just plays again */
  }
}

export function BillScroll({
  id,
  age,
  late,
  title,
  due,
  amount,
  onOpen,
}: {
  /** The card's account id: what this phone remembers its age by. */
  id: string;
  /** Bills unpaid in a row (1, 2, 3+). */
  age: number;
  late: boolean;
  title: string;
  due: string;
  amount: ReactNode;
  onOpen: () => void;
}) {
  const a = Math.min(3, Math.max(1, age));
  const before = useRef(seenAge(id));
  // Older than last time: start from the old look, so the change can be seen.
  const [look, setLook] = useState(() =>
    before.current > 0 && before.current < a && !reducedMotion() ? before.current : a,
  );
  const busy = useRef(false);
  const root = useRef<HTMLButtonElement>(null);
  const paper = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);

  // Rods `open` (0 = together in the middle, 1 = at the ends), the paper opening with them.
  const roll = (from: number, to: number, o: { duration: number; ease: readonly number[] }) => {
    const half = (paper.current?.offsetWidth ?? 0) / 2;
    const at = (p: number) => half * (1 - p);
    const clip = (p: number) => `inset(0 ${50 * (1 - p)}% 0 ${50 * (1 - p)}%)`;
    const ease = [...o.ease] as [number, number, number, number];
    return Promise.all([
      animate(left.current!, { x: [at(from), at(to)] }, { duration: o.duration, ease }),
      animate(right.current!, { x: [-at(from), -at(to)] }, { duration: o.duration, ease }),
      animate(paper.current!, { clipPath: [clip(from), clip(to)] }, { duration: o.duration, ease }),
      animate(
        text.current!,
        { opacity: [from, to] },
        { duration: o.duration * 0.6, delay: to > from ? o.duration * 0.4 : 0 },
      ),
    ]);
  };

  // The ageing moment: a crumple, and halfway through, the new look (the edge tears by CSS transition).
  const crumple = async () => {
    const shake = animate(
      root.current!,
      { scale: [1, 0.93, 1.03, 0.98, 1], rotate: [0, -2.5, 2, -1, 0] },
      { duration: 0.7 },
    );
    setTimeout(() => setLook(a), 250);
    await shake;
  };

  useLayoutEffect(() => {
    const done = () => {
      keepAge(id, a);
      busy.current = false;
    };
    if (reducedMotion()) return done();
    busy.current = true;
    const ages = before.current > 0 && before.current < a;
    // Rolled up before the first paint, so it never flashes open before unrolling.
    if (!unrolled.has(id)) {
      const half = (paper.current?.offsetWidth ?? 0) / 2;
      left.current!.style.transform = `translateX(${half}px)`;
      right.current!.style.transform = `translateX(${-half}px)`;
      paper.current!.style.clipPath = 'inset(0 50% 0 50%)';
      text.current!.style.opacity = '0';
    }
    void (async () => {
      if (!unrolled.has(id)) {
        unrolled.add(id);
        await roll(0, 1, { duration: 0.7, ease: EASE_OUT });
      }
      if (ages) await crumple();
      done();
    })();
    // Only on arrival: later renders keep it as it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = async () => {
    if (busy.current) return;
    busy.current = true;
    // An 8-bit blink, hard on / off with no fade, like a picked menu item.
    if (!reducedMotion())
      await root.current!.animate(
        [1, 0, 1, 0, 1].map(opacity => ({ opacity, easing: 'steps(1, end)' })),
        { duration: 260 },
      ).finished;
    onOpen();
  };

  return (
    <button
      ref={root}
      type="button"
      onClick={tap}
      className="bill-scroll"
      data-age={look}
      data-late={late || undefined}
      aria-label={`${title}, ${amount}, ${due}, ${AGE_WORDS[a].toLowerCase()}`}
    >
      <span ref={left} className="bill-scroll-rod" aria-hidden="true" />
      <span ref={paper} className="bill-scroll-paper">
        <span className="bill-scroll-sheet">
          <span ref={text} className="bill-scroll-text">
            <span className="min-w-0 flex-1">
              <span className="bill-scroll-title">{title}</span>
              <span className="bill-scroll-due">{due}</span>
              {a > 1 && <span className="bill-scroll-age">{AGE_WORDS[a]}</span>}
            </span>
            <span className="num bill-scroll-amount">{amount}</span>
          </span>
        </span>
      </span>
      <span ref={right} className="bill-scroll-rod" aria-hidden="true" />
    </button>
  );
}
