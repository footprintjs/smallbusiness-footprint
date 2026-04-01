import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Campaign scheduling flow — validates and schedules a campaign for future delivery.
 */
export function createCampaignScheduleFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Validate-Input",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.campaignId || typeof input.campaignId !== "string") {
        throw new Error("Campaign ID is required");
      }
      if (!input?.scheduleAt || typeof input.scheduleAt !== "string") {
        throw new Error("Schedule time is required");
      }
      scope.campaignId = input.campaignId;
      scope.scheduleAt = input.scheduleAt;
    },
    "validate-input",
    undefined,
    `Validate ${term("campaign")} scheduling details`,
  )
    .addFunction(
      "Schedule-Campaign",
      async (scope) => {
        const campaign = await repo.updateCampaign({
          campaignId: scope.campaignId as string,
          status: "SCHEDULED",
          scheduleAt: scope.scheduleAt as string,
        });
        scope.scheduledCampaign = campaign;
        scope.output = { campaignId: campaign.campaignId, status: campaign.status, scheduleAt: campaign.scheduleAt };
      },
      "schedule-campaign",
      `Schedule the ${term("campaign")} for delivery`,
    )
    .build();
}
