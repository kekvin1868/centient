// Shared by the cards e2e specs (cards.e2e.ts = slice 1, cardLimits.e2e.ts = slice 0): the app as they read and
// drive it. Not a spec itself (Playwright refuses a spec imported by another), so the reset hooks stay in each spec.
import { test as base, expect, type Locator, type Page } from '@playwright/test';
export { expect };
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

export type Acc = {
  id: string;
  name: string;
  kind: string;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
};
export type CardSeed = {
  kind: 'CREDIT_CARD' | 'PAYLATER';
  limit: number;
  closes: number;
  due: number;
  /** Still unpaid on the last bill. */
  billed?: number;
  /** Spent since the last bill. */
  since?: number;
};

/** Today's day of the month on the server's clock (WIB). */
export const today = () => new Date(Date.now() + 7 * 3600e3).getUTCDate();
/** A closing day that is never today, so what is billed vs spent since is the same on every day of the month. */
export const notToday = (day: number) => (day === today() ? day + 1 : day);

/** Runs SQL on the e2e database itself: only for data the API now refuses (a card from before slice 0 / 1). */
export const sql = (command: string) =>
  execSync(
    `npx wrangler d1 execute DB --local --persist-to "${resolve(import.meta.dirname, '../.e2e-state')}" --command "${command}"`,
    { cwd: resolve(import.meta.dirname, '../apps/centient'), stdio: 'ignore' },
  );

/** The app as these tests read and drive it, on the test's own page. */
export function cardsApp(page: Page) {
  const api = async (method: 'get' | 'post' | 'patch', path: string, data?: unknown) => {
    const r = await page.request[method](`/api${path}`, { data });
    expect(r.ok(), `${method.toUpperCase()} ${path}: ${await r.text()}`).toBe(true);
    return r.json();
  };
  const account = async (name: string) =>
    ((await api('get', '/catalog')).accounts as Acc[]).find(a => a.name === name)!;
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  return {
    api,
    account,
    balance: async (name: string) =>
      ((await api('get', '/balances')).accounts as { name: string; balance: number }[]).find(
        a => a.name === name,
      )!.balance,
    /** The card's bill as the server splits it: on the last bill, and spent since. */
    bill: async (accountId: string) =>
      (
        (await api('get', '/recurring')).cards as {
          accountId: string;
          bill: number;
          spentSince: number;
        }[]
      ).find(c => c.accountId === accountId)!,
    /** Skips the first run. */
    onboard: () => api('patch', '/workspace', { onboarded: true }),
    addCard: async (name: string, c: CardSeed) =>
      (await api('post', '/accounts', {
        name,
        kind: c.kind,
        creditLimit: c.limit,
        statementDay: c.closes,
        dueDay: c.due,
        openingBalance: -((c.billed ?? 0) + (c.since ?? 0)) || undefined,
        billedBalance: c.billed,
      })) as Acc,
    setBalance: async (name: string, actual: number) =>
      api('post', `/accounts/${(await account(name)).id}/balance`, { actual }),
    tab,
    limits: () => page.getByRole('region', { name: 'Cards and pay later' }),
    openAccounts: async () => {
      await tab('Menu').tap();
      await page.getByRole('option', { name: 'Accounts & pockets', exact: true }).tap();
    },
    /** Picks an account card on Money the way a keyboard user would: focus turns the hand to it, Enter picks it. */
    pick: async (name: string) => {
      const card = page
        .getByRole('group', { name: 'Accounts' })
        .getByRole('button', { name: new RegExp(`^${name}`) });
      await card.focus();
      await card.press('Enter');
      await expect(card).toHaveAttribute('aria-pressed', 'true');
    },
    /** E2E_SHOTS=<dir> saves a screenshot at each step worth looking at (for a human check); off by default. */
    shot: async (name: string, part?: Locator) => {
      if (process.env.E2E_SHOTS)
        await (part ?? page).screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` });
    },
    /** The picked account's details on Money (name, hero, its limit bar); only framed for a screenshot. */
    picked: (kind: string) => page.locator(`.rarity-${kind}`).last().locator('xpath=../..'),
  };
}

export const test = base.extend<{ app: ReturnType<typeof cardsApp> }>({
  app: async ({ page }, use) => use(cardsApp(page)),
});
