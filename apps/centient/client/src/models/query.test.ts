import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ showToast: vi.fn() }));
const { queryClient } = await import('./query');
const { version } = await import('../lib/state');
const { showToast } = await import('../ui/Toast');

const seed = () => {
  queryClient.clear();
  queryClient.setQueryData(['budgets', 'status'], 1);
  queryClient.setQueryData(['accounts', 'balances'], 2);
};
const stale = (key: string[]) => queryClient.getQueryState(key)!.isInvalidated;
const save = (meta?: { invalidates: string[][] }, fail = false) =>
  queryClient
    .getMutationCache()
    .build(queryClient, {
      mutationFn: async () => {
        if (fail) throw new Error('Refused');
        return 'ok';
      },
      meta,
    })
    .execute(undefined)
    .catch(() => undefined);

describe('saves refresh what they name', () => {
  it('marks only the named queries stale', async () => {
    seed();
    await save({ invalidates: [['budgets']] });
    expect(stale(['budgets', 'status'])).toBe(true);
    expect(stale(['accounts', 'balances'])).toBe(false);
  });

  it('marks everything stale when a save names nothing', async () => {
    seed();
    await save();
    expect(stale(['budgets', 'status'])).toBe(true);
    expect(stale(['accounts', 'balances'])).toBe(true);
  });

  it('tells screens not on queries yet (version) without echoing back', async () => {
    seed();
    const before = version.value;
    await save({ invalidates: [['budgets']] });
    expect(version.value).toBe(before + 1);
    expect(stale(['accounts', 'balances'])).toBe(false); // the bump did not invalidate everything
  });

  it('a legacy save (version bump) marks every query stale', () => {
    seed();
    version.value++;
    expect(stale(['accounts', 'balances'])).toBe(true);
  });

  it('shows a refused save as a toast', async () => {
    seed();
    await save(undefined, true);
    expect(showToast).toHaveBeenCalledWith('Refused');
  });
});
