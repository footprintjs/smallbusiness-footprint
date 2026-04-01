import { describe, it, expect } from "vitest";
import { FlowChartExecutor } from "footprintjs";
import { createCampaignCreateFlow } from "../../flows/campaigns/campaignCreateFlow.js";
import { createCampaignScheduleFlow } from "../../flows/campaigns/campaignScheduleFlow.js";
import { createCampaignSendBatchFlow } from "../../flows/campaigns/campaignSendBatchFlow.js";
import { createMockRepository } from "../helpers.js";

describe("campaign create flow", () => {
  const repo = createMockRepository();

  it("creates a campaign draft", async () => {
    const flow = createCampaignCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { label: "Spring Sale", subject: "50% off everything!" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.createdCampaign).toBeDefined();
    expect((state.output as any).status).toBe("DRAFT");
    expect((state.output as any).campaignId).toBeTruthy();
  });

  it("rejects campaign without subject", async () => {
    const flow = createCampaignCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { label: "No Subject" },
    }});

    await expect(executor.run()).rejects.toThrow("Campaign subject is required");
  });

  it("defaults label to Untitled Campaign", async () => {
    const flow = createCampaignCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { subject: "Test Subject" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect(state.label).toBe("Untitled Campaign");
  });
});

describe("campaign schedule flow", () => {
  const repo = createMockRepository();

  it("schedules a campaign", async () => {
    const flow = createCampaignScheduleFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { campaignId: "campaign-1", scheduleAt: "2026-04-15T10:00:00Z" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.scheduledCampaign).toBeDefined();
    expect((state.output as any).status).toBe("SCHEDULED");
  });

  it("rejects without campaign ID", async () => {
    const flow = createCampaignScheduleFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { scheduleAt: "2026-04-15T10:00:00Z" },
    }});

    await expect(executor.run()).rejects.toThrow("Campaign ID is required");
  });

  it("rejects without schedule time", async () => {
    const flow = createCampaignScheduleFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { campaignId: "campaign-1" },
    }});

    await expect(executor.run()).rejects.toThrow("Schedule time is required");
  });
});

describe("campaign send batch flow", () => {
  const repo = createMockRepository();

  it("sends a batch to active subscribers", async () => {
    const flow = createCampaignSendBatchFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { campaignId: "campaign-1" },
    }});
    executor.enableNarrative();

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.finalizedCampaign).toBeDefined();
    const output = state.output as any;
    expect(output.status).toBe("SENT");
    expect(output.sentCount).toBeGreaterThanOrEqual(2);
    expect(output.failedCount).toBe(0);
  });

  it("rejects without campaign ID", async () => {
    const flow = createCampaignSendBatchFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {},
    }});

    await expect(executor.run()).rejects.toThrow("Campaign ID is required");
  });

  it("produces narrative entries", async () => {
    const flow = createCampaignSendBatchFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { campaignId: "campaign-1" },
    }});
    executor.enableNarrative();

    await executor.run();
    const narrative = executor.getNarrative();
    expect(narrative.length).toBeGreaterThan(0);
  });
});
