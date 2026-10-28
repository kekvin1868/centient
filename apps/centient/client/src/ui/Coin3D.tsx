// The brand coin turning in 3D: stacked copies of the pixel coin give it thickness, and a rim strip facing
// sideways gives it a body when it turns edge-on. Fills its box; `paused` freezes it mid-turn.
import { CoinMark } from './Logo';

const LAYERS = 9;

export function Coin3D({ paused = false, className = '' }: { paused?: boolean; className?: string }) {
  return (
    <div className={`coin3d ${paused ? 'paused' : ''} ${className}`} aria-hidden="true">
      <div className="coin3d-spin">
        <b />
        {Array.from({ length: LAYERS }, (_, i) => (
          <i key={i} className={i && i < LAYERS - 1 ? 'mid' : ''} style={{ transform: `translateZ(${((i - (LAYERS - 1) / 2) * 1.7).toFixed(1)}px)` }}>
            <CoinMark />
          </i>
        ))}
      </div>
    </div>
  );
}
