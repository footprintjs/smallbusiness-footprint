import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Order creation flow — validates cart, creates order record, builds output.
 */
export function createOrderCreateFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Normalize-Order",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.email || typeof input.email !== "string") {
        throw new Error("Customer email is required");
      }
      const items = input.items;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("At least one item is required");
      }
      const shipping = input.shipping;
      if (!shipping || typeof shipping !== "object") {
        throw new Error("Shipping information is required");
      }
      scope.email = input.email;
      scope.items = items;
      scope.shipping = shipping;
      scope.currency = typeof input.currency === "string" ? input.currency : "usd";
    },
    "normalize-order",
    undefined,
    `Validate ${term("order")} details: email, items, and ${term("shipping")} info`,
  )
    .addFunction(
      "Create-Record",
      async (scope) => {
        const order = await repo.createOrder({
          email: scope.email as string,
          items: scope.items as any[],
          shipping: scope.shipping as any,
          currency: scope.currency as string,
        });
        scope.createdOrder = order;
      },
      "create-record",
      `Create the ${term("order")} record in the repository`,
    )
    .addFunction(
      "Build-Output",
      async (scope) => {
        const order = scope.createdOrder as Record<string, unknown>;
        scope.output = {
          orderId: order.orderId,
          status: order.status,
          total: order.total,
          currency: order.currency,
        };
      },
      "build-output",
      `Build the ${term("order")} confirmation response`,
    )
    .build();
}
