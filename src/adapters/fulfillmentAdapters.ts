import type { Adapter } from "@footprint/adapters";
import type { BusinessRepository } from "../types.js";

/**
 * Create fulfillment adapters with repository access.
 * Each adapter handles order creation with type-specific fulfillment logic.
 */
export function createFulfillmentAdapters(repo: BusinessRepository): readonly Adapter[] {
  const standardShipping: Adapter = {
    id: "standard-shipping",
    name: "Standard Shipping Fulfillment",
    capabilityId: "create-order",
    async execute(input, _context) {
      const { email, items, shipping, currency } = input as Record<string, unknown>;
      if (!email || typeof email !== "string") throw new Error("standard-shipping: email is required");
      if (!Array.isArray(items) || items.length === 0) throw new Error("standard-shipping: items are required");
      if (!shipping || typeof shipping !== "object") throw new Error("standard-shipping: shipping info is required");
      const order = await repo.createOrder({
        email: email as string,
        items: items as any[],
        shipping: shipping as any,
        currency: (currency as string) ?? "usd",
      });
      return { created: true, pattern: "standard-shipping", order };
    },
  };

  const localDelivery: Adapter = {
    id: "local-delivery",
    name: "Local Delivery Fulfillment",
    capabilityId: "create-order",
    async execute(input, _context) {
      const { email, items, shipping, currency } = input as Record<string, unknown>;
      if (!email || typeof email !== "string") throw new Error("local-delivery: email is required");
      if (!Array.isArray(items) || items.length === 0) throw new Error("local-delivery: items are required");
      if (!shipping || typeof shipping !== "object") throw new Error("local-delivery: shipping info is required");
      const order = await repo.createOrder({
        email: email as string,
        items: items as any[],
        shipping: shipping as any,
        currency: (currency as string) ?? "usd",
      });
      return { created: true, pattern: "local-delivery", order };
    },
  };

  return [standardShipping, localDelivery];
}

// Static stubs for adapter registry bootstrapping — throw if invoked
export const standardShippingAdapter: Adapter = {
  id: "standard-shipping", name: "Standard Shipping Fulfillment", capabilityId: "create-order",
  async execute() { throw new Error("Static adapter stub invoked. Use createFulfillmentAdapters(repo) for a real adapter."); },
};
export const localDeliveryAdapter: Adapter = {
  id: "local-delivery", name: "Local Delivery Fulfillment", capabilityId: "create-order",
  async execute() { throw new Error("Static adapter stub invoked. Use createFulfillmentAdapters(repo) for a real adapter."); },
};

export const allFulfillmentAdapters: readonly Adapter[] = [
  standardShippingAdapter, localDeliveryAdapter,
];
