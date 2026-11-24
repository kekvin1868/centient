// The categories the app finds by name (seeded in every workspace). Its own file so the web app can read the names
// without loading the ledger rules.
/** Transfer fees and card / plan interest (an expense category). */
export const FEES_CATEGORY = 'Fees & Interests';
/** An account's first balance (an income category, signed). */
export const OPENING_CATEGORY = 'Opening balance';
/** An uncategorised balance correction (an income category, signed). */
export const ADJUSTMENT_CATEGORY = 'Balance adjustment';
/** Bookkeeping, not real income: never offered to pick, and Insights leave them out. */
export const BOOKKEEPING_CATEGORIES = [OPENING_CATEGORY, ADJUSTMENT_CATEGORY];
/** Categories the app finds by name: they can't be deleted (or renamed, on the web app). */
export const BUILT_IN_CATEGORIES = [FEES_CATEGORY, ...BOOKKEEPING_CATEGORIES];
