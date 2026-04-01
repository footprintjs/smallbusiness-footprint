import type { UnitOverrides, UnitOverrideStore } from "../types.js";

/**
 * In-memory override store for per-unit customization.
 * Individual shops can override terminology, module toggles, and theme.
 */
export function createMemoryOverrideStore(
  overrides: Record<string, UnitOverrides> = {},
): UnitOverrideStore {
  const store = new Map(Object.entries(overrides));
  return {
    async getOverrides(unitId) {
      return store.get(unitId);
    },
  };
}
