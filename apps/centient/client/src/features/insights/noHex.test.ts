// T4.28: the Insights screen and its chart pieces bring no colours of their own (palette tokens only).
import { describe, expect, it } from 'vitest';
import bars from '../../ui/RankedBars.tsx?raw';
import scale from '../../ui/chartScale.ts?raw';
import sign from '../../ui/NuclearSign.tsx?raw';
import screen from '../../screens/Insights.tsx?raw';
import chips from './CurrencyChips.tsx?raw';
import headline from './InsightsHeadline.tsx?raw';
import period from './PeriodBar.tsx?raw';
import chart from '../../ui/BarChart.tsx?raw';
import savings from './SavingsBars.tsx?raw';
import list from './EntriesSheet.tsx?raw';
import biggest from './BiggestExpenses.tsx?raw';
import exportRow from './ExportRow.tsx?raw';
import report from './report.ts?raw';
import listsGuide from './ListsGuideSheet.tsx?raw';
import chartsGuide from './ChartsGuideSheet.tsx?raw';

describe('Insights colours', () => {
  it('has no #rrggbb literals', () => {
    for (const src of [
      bars,
      scale,
      sign,
      screen,
      chips,
      headline,
      period,
      chart,
      savings,
      list,
      biggest,
      exportRow,
      report,
      listsGuide,
      chartsGuide,
    ])
      expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
