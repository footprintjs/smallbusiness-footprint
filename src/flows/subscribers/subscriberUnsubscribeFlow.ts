import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Unsubscribe flow — validates token and marks subscriber as unsubscribed.
 */
export function createSubscriberUnsubscribeFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Validate-Token",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.token || typeof input.token !== "string") {
        throw new Error("Unsubscribe token is required");
      }
      scope.token = input.token.trim();
    },
    "validate-token",
    undefined,
    `Validate the unsubscribe token`,
  )
    .addFunction(
      "Unsubscribe",
      async (scope) => {
        const subscriber = await repo.unsubscribeByToken(scope.token as string);
        scope.unsubscribedSubscriber = subscriber;
        scope.output = { email: subscriber.email, status: subscriber.status };
      },
      "unsubscribe",
      `Mark the ${term("subscriber")} as unsubscribed`,
    )
    .build();
}
