import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Subscriber creation flow — validates email and upserts subscriber.
 */
export function createSubscriberCreateFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Normalize-Input",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
      if (!email) {
        throw new Error("Subscriber email is required");
      }
      scope.email = email;
      scope.name = typeof input?.name === "string" ? input.name.trim() : undefined;
      scope.tags = Array.isArray(input?.tags) ? input.tags.filter((v: unknown) => typeof v === "string") : [];
      scope.source = typeof input?.source === "string" ? input.source : "signup";
    },
    "normalize-input",
    undefined,
    `Validate and normalize ${term("subscriber")} details`,
  )
    .addFunction(
      "Upsert-Subscriber",
      async (scope) => {
        const subscriber = await repo.upsertSubscriber({
          email: scope.email as string,
          name: scope.name as string | undefined,
          tags: scope.tags as string[],
          source: scope.source as string,
        });
        scope.createdSubscriber = subscriber;
        scope.output = { email: subscriber.email, status: subscriber.status };
      },
      "upsert-subscriber",
      `Create or update the ${term("subscriber")} record`,
    )
    .build();
}
