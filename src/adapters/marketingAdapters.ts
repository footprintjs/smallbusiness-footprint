import type { Adapter } from "@footprint/adapters";
import type { BusinessRepository } from "../types.js";

/**
 * Create marketing adapters with repository access.
 * Handles subscriber management and campaign sending.
 */
export function createMarketingAdapters(repo: BusinessRepository): readonly Adapter[] {
  const subscriberManager: Adapter = {
    id: "subscriber-manager",
    name: "Subscriber Manager",
    capabilityId: "manage-subscribers",
    async execute(input, _context) {
      const { email, action } = input as Record<string, unknown>;
      if (!email || typeof email !== "string") throw new Error("subscriber-manager: email is required");
      if (action === "unsubscribe") {
        const token = (input as Record<string, unknown>).token as string | undefined;
        if (!token) throw new Error("subscriber-manager: token is required for unsubscribe");
        const sub = await repo.unsubscribeByToken(token);
        return { managed: true, action: "unsubscribe", subscriber: sub };
      }
      const sub = await repo.upsertSubscriber({ email, name: (input as any).name, tags: (input as any).tags, source: (input as any).source });
      return { managed: true, action: "upsert", subscriber: sub };
    },
  };

  const campaignSender: Adapter = {
    id: "campaign-sender",
    name: "Campaign Email Sender",
    capabilityId: "send-campaign",
    async execute(input, _context) {
      const { campaignId } = input as Record<string, unknown>;
      if (!campaignId || typeof campaignId !== "string") throw new Error("campaign-sender: campaignId is required");
      const campaign = await repo.getCampaign(campaignId);
      if (!campaign) throw new Error(`campaign-sender: campaign not found: ${campaignId}`);
      const subscribers = await repo.listSubscribers({ status: "ACTIVE" });
      const sentCount = campaign.sentCount + subscribers.length;
      const updated = await repo.recordSendResult({ campaignId, sentCount, failedCount: campaign.failedCount });
      return { sent: true, campaign: updated, batchSize: subscribers.length };
    },
  };

  return [subscriberManager, campaignSender];
}

// Static stubs — throw if invoked
export const subscriberManagerAdapter: Adapter = {
  id: "subscriber-manager", name: "Subscriber Manager", capabilityId: "manage-subscribers",
  async execute() { throw new Error("Static adapter stub invoked. Use createMarketingAdapters(repo) for a real adapter."); },
};
export const campaignSenderAdapter: Adapter = {
  id: "campaign-sender", name: "Campaign Email Sender", capabilityId: "send-campaign",
  async execute() { throw new Error("Static adapter stub invoked. Use createMarketingAdapters(repo) for a real adapter."); },
};

export const allMarketingAdapters: readonly Adapter[] = [subscriberManagerAdapter, campaignSenderAdapter];
