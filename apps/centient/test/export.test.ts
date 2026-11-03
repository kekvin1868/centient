// Step 7: the CSV export for one period and currency. No options keeps the old export byte for byte.
import { beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './world';

let w: World;
// Tuesday 10 Nov 2026, 10:00 in Jakarta.
const NOW = Date.parse('2026-11-10T03:00:00Z');
beforeAll(() => {
  w = world({ now: () => NOW });
});

let n = 0;
/** BCA (IDR, 10,000,000 opening) and Wise (USD), with rows around November and a USD to IDR transfer. */
async function fixture() {
  const ws = (await w.repos.workspaces.ensure(`export${++n}@test`)).workspaceId;
  const s = w.svc(ws);
  const cat = (name: string) => cats.find(c => c.name === name)!.id;
  const cats = await w.repos.categories.list(ws);
  const bca = await s.accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 10_000_000 });
  const wise = await s.accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD' }); // no opening: its row would tie with BCA's
  await s.ledger.record([
    {
      type: 'EXPENSE',
      accountId: bca.id,
      categoryId: cat('Food & Drink'),
      amount: 30_000,
      date: '2026-10-31',
      merchant: 'Warkop',
    },
    {
      type: 'EXPENSE',
      accountId: bca.id,
      categoryId: cat('Food & Drink'),
      amount: 45_000,
      date: '2026-11-02',
      merchant: 'Kopi, "Tuku"\nBlok M',
    },
    {
      type: 'EXPENSE',
      accountId: wise.id,
      categoryId: cat('Food & Drink'),
      amount: 450,
      date: '2026-11-03',
      merchant: 'Blue Bottle',
    },
    {
      type: 'TRANSFER',
      fromAccountId: wise.id,
      toAccountId: bca.id,
      amount: 10_000,
      toAmount: 1_600_000,
      date: '2026-11-05',
    },
    {
      type: 'EXPENSE',
      accountId: bca.id,
      categoryId: cat('Transport'),
      amount: 20_000,
      date: '2026-11-30',
    },
    {
      type: 'EXPENSE',
      accountId: bca.id,
      categoryId: cat('Transport'),
      amount: 25_000,
      date: '2026-12-01',
    },
  ]);
  return s;
}
const dates = (csv: string) =>
  csv
    .split('\n')
    .slice(1)
    .map(l => l.slice(0, 10));

// The export before this step, for the fixture (T7.1).
const BEFORE = `date,type,account,amount,currency,envelope,category,merchant,note
2026-12-01T10:00:00+07:00,EXPENSE,BCA,-25000,IDR,Main,Transport,,
2026-11-30T10:00:00+07:00,EXPENSE,BCA,-20000,IDR,Main,Transport,,
2026-11-10T10:00:00+07:00,INCOME,BCA,10000000,IDR,Main,Opening balance,,Opening balance
2026-11-05T10:00:00+07:00,TRANSFER,BCA,1600000,IDR,Main > Main,,,
2026-11-05T10:00:00+07:00,TRANSFER,Wise,-10000,USD,Main > Main,,,
2026-11-03T10:00:00+07:00,EXPENSE,Wise,-450,USD,Main,Food & Drink,blue bottle,
2026-11-02T10:00:00+07:00,EXPENSE,BCA,-45000,IDR,Main,Food & Drink,"kopi, ""tuku""
blok m",
2026-10-31T10:00:00+07:00,EXPENSE,BCA,-30000,IDR,Main,Food & Drink,warkop,`;

describe('CSV export', () => {
  it('is unchanged without options (T7.1)', async () => {
    // A cross-currency transfer is two transactions at the same time, ordered by random id (as before this step), so
    // its two legs may swap: compare the lines, not their order.
    const csv = await (await fixture()).workspace.csv();
    expect(csv.split('\n').sort()).toEqual(BEFORE.split('\n').sort());
    expect(csv.length).toBe(BEFORE.length);
    expect(csv.split('\n')[0]).toBe(BEFORE.split('\n')[0]);
  });

  it('keeps only the period: from included, to excluded (T7.2)', async () => {
    const csv = await (await fixture()).workspace.csv({ from: '2026-11-01', to: '2026-12-01' });
    expect(dates(csv)).not.toContain('2026-10-31');
    expect(dates(csv)).not.toContain('2026-12-01');
    expect(dates(csv)).toContain('2026-11-30');
    expect(dates(csv)).toContain('2026-11-02');
  });

  it('keeps only rows in the currency, with the same header (T7.4, T7.5)', async () => {
    const s = await fixture();
    const usd = (
      await s.workspace.csv({ from: '2026-11-01', to: '2026-12-01', currency: 'USD' })
    ).split('\n');
    expect(usd[0]).toBe('date,type,account,amount,currency,envelope,category,merchant,note');
    expect(usd.slice(1).every(l => l.includes(',USD,'))).toBe(true);
    expect(usd.slice(1).filter(l => l.includes('EXPENSE'))).toHaveLength(1); // the Blue Bottle coffee
    const idr = (await s.workspace.csv({ currency: 'IDR' })).split('\n').slice(1);
    expect(idr.length).toBeGreaterThan(0);
    expect(idr.some(l => l.includes('Wise') || l.includes(',USD,'))).toBe(false);
  });

  it('splits a cross-currency transfer into its legs (T7.6)', async () => {
    const s = await fixture();
    const legs = async (currency?: string) =>
      (await s.workspace.csv({ from: '2026-11-05', to: '2026-11-06', currency }))
        .split('\n')
        .slice(1);
    expect(await legs('USD')).toEqual([expect.stringMatching(/,TRANSFER,Wise,-10000,USD,/)]);
    expect(await legs('IDR')).toEqual([expect.stringMatching(/,TRANSFER,BCA,1600000,IDR,/)]);
    expect(await legs()).toHaveLength(2);
  });

  it('escapes commas, quotes and newlines as before (T7.7)', async () => {
    expect(await (await fixture()).workspace.csv({ currency: 'IDR' })).toContain(
      '"kopi, ""tuku""\nblok m"',
    ); // merchants are stored lower-case
  });
});
