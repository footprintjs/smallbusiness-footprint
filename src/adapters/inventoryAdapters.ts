import type { Adapter } from "@footprint/adapters";
import type { BusinessRepository } from "../types.js";

/**
 * Create inventory adapters with repository access.
 */
export function createInventoryAdapters(repo: BusinessRepository): readonly Adapter[] {
  const inventoryTracker: Adapter = {
    id: "inventory-tracker",
    name: "Inventory Tracker",
    capabilityId: "manage-inventory",
    async execute(input, _context) {
      const { productId, sku, quantityChange } = input as Record<string, unknown>;
      if (!productId || typeof productId !== "string") throw new Error("inventory-tracker: productId is required");
      if (!sku || typeof sku !== "string") throw new Error("inventory-tracker: sku is required");
      if (quantityChange == null || typeof quantityChange !== "number") throw new Error("inventory-tracker: quantityChange is required");
      const item = await repo.updateStock({ productId, sku, quantityChange });
      return { updated: true, item };
    },
  };

  return [inventoryTracker];
}

// Static stub — throws if invoked
export const inventoryTrackerAdapter: Adapter = {
  id: "inventory-tracker", name: "Inventory Tracker", capabilityId: "manage-inventory",
  async execute() { throw new Error("Static adapter stub invoked. Use createInventoryAdapters(repo) for a real adapter."); },
};

export const allInventoryAdapters: readonly Adapter[] = [inventoryTrackerAdapter];
