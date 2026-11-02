// T4.28: the Insights screen and its chart pieces bring no colours of their own (palette tokens only).
import { describe, expect, it } from 'vitest';
import bars from '../../ui/RankedBars.tsx?raw';
import scale from '../../ui/chartScale.ts?raw';
import sign from '../../ui/NuclearSign.tsx?raw';
import screen from '../../screens/Insights.tsx?raw';
import chips from './CurrencyChips.tsx?raw';
import headline from './InsightsHeadline.tsx?raw';
import period from './PeriodBar.tsx?raw';

describe('Insights colours', () => {
  it('has no #rrggbb literals', () => {
    for (const src of [bars, scale, sign, screen, chips, headline, period]) expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
