import type { Adapter } from "@footprint/adapters";
import type { BusinessRepository } from "../types.js";

/**
 * Create payment adapters with repository access.
 */
export function createPaymentAdapters(repo: BusinessRepository): readonly Adapter[] {
  const stripeCheckout: Adapter = {
    id: "stripe-checkout",
    name: "Stripe Checkout",
    capabilityId: "process-payment",
    async execute(input, _context) {
      const { orderId } = input as Record<string, unknown>;
      if (!orderId || typeof orderId !== "string") {
        throw new Error("stripe-checkout: orderId is required");
      }
      const order = await repo.getOrder(orderId);
      if (!order) {
        throw new Error(`stripe-checkout: order not found: ${orderId}`);
      }
      const updated = await repo.updateOrderStatus(order.orderId, "PAYMENT_PENDING");
      return { processed: true, gateway: "stripe", order: updated };
    },
  };

  return [stripeCheckout];
}

// Static stub for adapter registry bootstrapping — throws if invoked
export const stripeCheckoutAdapter: Adapter = {
  id: "stripe-checkout", name: "Stripe Checkout", capabilityId: "process-payment",
  async execute() { throw new Error("Static adapter stub invoked. Use createPaymentAdapters(repo) for a real adapter."); },
};

export const allPaymentAdapters: readonly Adapter[] = [stripeCheckoutAdapter];
