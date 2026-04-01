import { describe, it, expect } from "vitest";
import { FlowChartExecutor } from "footprintjs";
import { createSubscriberCreateFlow } from "../../flows/subscribers/subscriberCreateFlow.js";
import { createSubscriberUnsubscribeFlow } from "../../flows/subscribers/subscriberUnsubscribeFlow.js";
import { createMockRepository } from "../helpers.js";

describe("subscriber create flow", () => {
  const repo = createMockRepository();

  it("creates a subscriber with valid email", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "Jane@Example.com" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.createdSubscriber).toBeDefined();
    expect((state.output as any).email).toBe("jane@example.com");
    expect((state.output as any).status).toBe("ACTIVE");
  });

  it("normalizes email to lowercase and trims", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "  Test@EXAMPLE.com  " },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect(state.email).toBe("test@example.com");
  });

  it("rejects empty email", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "" },
    }});

    await expect(executor.run()).rejects.toThrow("Subscriber email is required");
  });

  it("rejects missing email", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "Jane" },
    }});

    await expect(executor.run()).rejects.toThrow("Subscriber email is required");
  });

  it("defaults source to signup", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "test@example.com" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect(state.source).toBe("signup");
  });
});

describe("subscriber unsubscribe flow", () => {
  const repo = createMockRepository();

  it("unsubscribes with valid token", async () => {
    const flow = createSubscriberUnsubscribeFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { token: "tok-abc123" },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.unsubscribedSubscriber).toBeDefined();
    expect((state.output as any).status).toBe("UNSUBSCRIBED");
  });

  it("rejects missing token", async () => {
    const flow = createSubscriberUnsubscribeFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {},
    }});

    await expect(executor.run()).rejects.toThrow("Unsubscribe token is required");
  });
});
