import type { UnitOverrides, UnitOverrideStore } from '../types.js';
import type { BusinessScope } from '../operations.js';
const key = (scope: BusinessScope) => JSON.stringify([scope.tenantId, scope.campusId ?? null, scope.unitId]);
export function createMemoryOverrideStore(initial: readonly { scope: BusinessScope; overrides: UnitOverrides }[] = []): UnitOverrideStore {
  const store = new Map(initial.map(item => [key(item.scope), structuredClone(item.overrides)]));
  return { async getOverrides(scope) { const value = store.get(key(scope)); return value ? structuredClone(value) : undefined; } };
}
