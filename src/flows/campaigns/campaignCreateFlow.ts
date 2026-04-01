import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Campaign creation flow — validates input and saves a draft campaign.
 */
export function createCampaignCreateFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Validate-Input",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.subject || typeof input.subject !== "string") {
        throw new Error("Campaign subject is required");
      }
      scope.label = typeof input.label === "string" ? input.label : "Untitled Campaign";
      scope.subject = input.subject;
      scope.templateId = typeof input.templateId === "string" ? input.templateId : undefined;
    },
    "validate-input",
    undefined,
    `Validate required ${term("campaign")} fields`,
  )
    .addFunction(
      "Save-Draft",
      async (scope) => {
        const campaign = await repo.createCampaign({
          label: scope.label as string,
          subject: scope.subject as string,
          templateId: scope.templateId as string | undefined,
          data: typeof (scope.input as any)?.data === "object" ? (scope.input as any).data : undefined,
        });
        scope.createdCampaign = campaign;
        scope.output = { campaignId: campaign.campaignId, status: campaign.status };
      },
      "save-draft",
      `Save the ${term("campaign")} as a draft`,
    )
    .build();
}
