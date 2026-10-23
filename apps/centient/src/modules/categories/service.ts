// Category use cases: add, rename or archive, delete (moving what was in it).
import type { ServiceDeps } from '../../context';
import type { Patch } from '../../lib/schemas';
import { DomainError } from '../../domain/ledger';
import type { Category } from '../../repos/categories';

// Looked up by name by the app itself (transfer fees, opening balances, balance corrections).
const BUILT_IN_CATEGORIES = ['Fees', 'Opening balance', 'Balance adjustment'];

export function createCategoriesService({ ws, now, repos, catalog }: ServiceDeps) {
  return {
    async create(i: { name: string; kind: Category['kind'] }) {
      const category = await repos.categories.create(ws, i);
      catalog.invalidate();
      return category;
    },

    async update(id: string, p: Patch) {
      const { archived, ...rest }: Record<string, unknown> = p;
      if (archived !== undefined) rest.archived_at = archived ? new Date(now()).toISOString() : null;
      if (!(await repos.categories.update(ws, id, rest))) throw new DomainError('NOT_FOUND', 'Not found');
      catalog.invalidate();
    },

    /** Deletes a category (soft): its entries, budgets and quick-add words move to `moveTo` (same kind) first. */
    async remove(id: string, moveTo: string) {
      const c = await catalog.load();
      const cat = c.categories.find(x => x.id === id);
      if (!cat) throw new DomainError('NOT_FOUND', 'Category not found');
      if (BUILT_IN_CATEGORIES.includes(cat.name)) throw new DomainError('BUILT_IN', `${cat.name} is used by the app and can't be deleted`);
      if (moveTo === id) throw new DomainError('SAME_CATEGORY', 'Pick another category for its entries');
      c.category(moveTo, cat.kind);
      await repos.categories.remove(ws, id, moveTo, new Date(now()).toISOString());
      catalog.invalidate();
    },
  };
}
