import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Campaign batch send flow — loads campaign, loads subscribers, tracks send results.
 */
export function createCampaignSendBatchFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Load-Campaign",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.campaignId || typeof input.campaignId !== "string") {
        throw new Error("Campaign ID is required");
      }
      const campaign = await repo.getCampaign(input.campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
      scope.campaignId = campaign.campaignId;
      scope.campaignSubject = campaign.subject;
      scope.priorSentCount = campaign.sentCount;
      scope.priorFailedCount = campaign.failedCount;
    },
    "load-campaign",
    undefined,
    `Load the ${term("campaign")} for sending`,
  )
    .addFunction(
      "Load-Subscribers",
      async (scope) => {
        const subscribers = await repo.listSubscribers({ status: "ACTIVE" });
        scope.subscriberCount = subscribers.length;
        scope.subscriberEmails = subscribers.map((s) => s.email);
      },
      "load-subscribers",
      `Load active ${term("subscriber")}s for the batch`,
    )
    .addFunction(
      "Send-Batch",
      async (scope) => {
        const emails = scope.subscriberEmails as string[];
        scope.sentCount = (scope.priorSentCount as number) + emails.length;
        scope.failedCount = scope.priorFailedCount as number;
      },
      "send-batch",
      `Send the ${term("campaign")} emails to the batch`,
    )
    .addFunction(
      "Finalize",
      async (scope) => {
        const campaign = await repo.recordSendResult({
          campaignId: scope.campaignId as string,
          sentCount: scope.sentCount as number,
          failedCount: scope.failedCount as number,
        });
        scope.finalizedCampaign = campaign;
        scope.output = {
          campaignId: campaign.campaignId,
          status: campaign.status,
          sentCount: scope.sentCount,
          failedCount: scope.failedCount,
        };
      },
      "finalize",
      `Update ${term("campaign")} status after sending`,
    )
    .build();
}
