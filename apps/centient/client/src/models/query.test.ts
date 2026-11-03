import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ showToast: vi.fn() }));
const { persist, queryClient } = await import('./query');
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

  it('persist resolves after the named queries refreshed, true when it worked', async () => {
    seed();
    const ok = await persist(async () => 'ok', [['budgets']]);
    expect(ok).toBe(true);
    expect(stale(['budgets', 'status'])).toBe(true);
    expect(stale(['accounts', 'balances'])).toBe(false);
    expect(await persist(async () => Promise.reject(new Error('No')))).toBe(false);
  });

  it('persist leaves the toast to an onError of its own', async () => {
    seed();
    const own = vi.fn();
    vi.mocked(showToast).mockClear();
    await persist(async () => Promise.reject(new Error('Offline')), undefined, own);
    expect(own).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows a refused save as a toast', async () => {
    seed();
    await save(undefined, true);
    expect(showToast).toHaveBeenCalledWith('Refused');
  });
});
