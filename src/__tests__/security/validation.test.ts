import { describe, it, expect } from "vitest";
import { FlowChartExecutor } from "footprintjs";
import { createProductCreateFlow } from "../../flows/catalog/productCreateFlow.js";
import { createOrderCreateFlow } from "../../flows/orders/orderCreateFlow.js";
import { createSubscriberCreateFlow } from "../../flows/subscribers/subscriberCreateFlow.js";
import { createCampaignCreateFlow } from "../../flows/campaigns/campaignCreateFlow.js";
import { createMockRepository } from "../helpers.js";
import { isValidBusinessType, getBusinessTypeConfig } from "../../helpers.js";

const repo = createMockRepository();

const maliciousStrings = [
  '<script>alert("xss")</script>',
  "'; DROP TABLE products; --",
  "{{constructor.constructor('return this')()}}",
  "../../../etc/passwd",
  "\\x00\\x01\\x02",
  "a".repeat(10000),
  "   ",
  "\n\r\t",
];

describe("security: product create validation", () => {
  it("handles malicious name strings without crashing", async () => {
    for (const name of maliciousStrings) {
      const flow = createProductCreateFlow(repo);
      const executor = new FlowChartExecutor(flow, { initialContext: {
        input: { name, basePrice: 100 },
      }});

      // Should not throw — the name is a valid string, just potentially malicious content.
      // The repo stores it as-is; sanitization is the app layer's responsibility.
      await executor.run();
      const state = executor.getSnapshot().sharedState as Record<string, unknown>;
      expect((state.createdProduct as any).name).toBe(name);
    }
  });

  it("rejects non-string name types", async () => {
    const invalidNames = [null, undefined, 123, {}, [], true];
    for (const name of invalidNames) {
      const flow = createProductCreateFlow(repo);
      const executor = new FlowChartExecutor(flow, { initialContext: {
        input: { name, basePrice: 100 },
      }});
      await expect(executor.run()).rejects.toThrow("Product name is required");
    }
  });

  it("rejects non-number base price", async () => {
    const invalidPrices = [null, undefined, "100", {}, [], true];
    for (const basePrice of invalidPrices) {
      const flow = createProductCreateFlow(repo);
      const executor = new FlowChartExecutor(flow, { initialContext: {
        input: { name: "Test", basePrice },
      }});
      await expect(executor.run()).rejects.toThrow("Base price is required");
    }
  });
});

describe("security: order create validation", () => {
  it("rejects missing email", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { items: [{ name: "Test", quantity: 1, price: 100 }], shipping: {} },
    }});
    await expect(executor.run()).rejects.toThrow("Customer email is required");
  });

  it("rejects non-array items", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "test@example.com", items: "not-an-array", shipping: {} },
    }});
    await expect(executor.run()).rejects.toThrow("At least one item is required");
  });
});

describe("security: subscriber validation", () => {
  it("normalizes email to prevent case-based duplicates", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "Test@EXAMPLE.COM" },
    }});
    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect(state.email).toBe("test@example.com");
  });

  it("trims whitespace from email", async () => {
    const flow = createSubscriberCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "  test@example.com  " },
    }});
    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect(state.email).toBe("test@example.com");
  });
});

describe("security: campaign validation", () => {
  it("rejects campaign with missing subject", async () => {
    const flow = createCampaignCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { label: "Test" },
    }});
    await expect(executor.run()).rejects.toThrow("Campaign subject is required");
  });
});

describe("security: type guard boundary", () => {
  it("rejects prototype pollution via isValidBusinessType", () => {
    expect(isValidBusinessType("__proto__")).toBe(false);
    expect(isValidBusinessType("constructor")).toBe(false);
    expect(isValidBusinessType("toString")).toBe(false);
  });

  it("rejects prototype pollution via getBusinessTypeConfig", () => {
    expect(getBusinessTypeConfig("__proto__")).toBeUndefined();
    expect(getBusinessTypeConfig("constructor")).toBeUndefined();
  });
});
