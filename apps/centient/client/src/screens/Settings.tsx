// Settings (a page of the Menu): categories, hidden items, when the month and the forecast start, reminders.
// "Hide" keeps history.
import { useState } from 'react';
import type { Category } from '../../../src/repos/categories';
import { ForecastStart } from '../features/budgets/ForecastStart';
import { AddCategorySheet } from '../features/categories/AddCategorySheet';
import { EditCategorySheet } from '../features/categories/EditCategorySheet';
import { PushSettings } from '../features/push/PushSettings';
import { HiddenItems } from '../features/workspace/HiddenItems';
import { MonthStart } from '../features/workspace/MonthStart';
import { Page, type Back } from '../layouts/Page';
import { categoryEmoji } from '../lib/labels';
import { active, catalog } from '../lib/state';
import { Group, Row } from '../ui/List';

export function Settings({ back }: { back: Back }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const cat = catalog.value;

  return (
    <Page title="Settings" back={back}>
      <Group label="Categories">
        {active(cat.categories)
          .filter(c => !['Balance adjustment', 'Opening balance'].includes(c.name))
          .map(c => (
            <Row
              key={c.id}
              title={`${categoryEmoji(c.name, c.kind)} ${c.name}`}
              sub={c.kind === 'EXPENSE' ? 'Spending' : 'Income'}
              chevron
              onClick={() => setCategory(c)}
            />
          ))}
        <Row
          title={<span className="text-primary">Add category</span>}
          onClick={() => setAdding(true)}
        />
      </Group>

      <HiddenItems />
      <MonthStart />
      <ForecastStart />
      <PushSettings />

      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <EditCategorySheet
        key={`category:${category?.id ?? 'none'}`}
        category={category}
        onClose={() => setCategory(null)}
      />
      <AddCategorySheet
        key={`add-category:${adding}`}
        open={adding}
        onClose={() => setAdding(false)}
      />
    </Page>
  );
}
